#!/usr/bin/env python3
"""
Server Win Probability Verification Script

This script tests the live server's win probability calculations by:
1. Fetching real data from the running server
2. Recalculating probabilities locally using the same formulas
3. Comparing server results to local calculations
4. Running Monte Carlo simulations to validate theoretical values
"""

import json
import math
import random
import urllib.request
from typing import Dict, List, Tuple
from dataclasses import dataclass

SERVER_URL = "http://localhost:3000"
MC_ITERATIONS = 50000  # Match server's iteration count


# =============================================================================
# Core Probability Functions (matching sosCalculator.js)
# =============================================================================

def elo_win_probability(rating1: float, rating2: float) -> float:
    """Standard Elo win probability: P = 1 / (1 + 10^((Elo2 - Elo1) / 400))"""
    return 1 / (1 + math.pow(10, (rating2 - rating1) / 400))


def get_match_probabilities(team_elo: float, opp_elo: float) -> Dict[str, float]:
    """Three-outcome model for group matches (win/draw/loss)."""
    win_expectancy = 1 / (1 + math.pow(10, (opp_elo - team_elo) / 400))
    elo_diff = abs(team_elo - opp_elo)
    draw_prob = max(0.15, 0.27 - elo_diff * 0.0004)
    win_prob = win_expectancy * (1 - draw_prob)
    loss_prob = (1 - win_expectancy) * (1 - draw_prob)
    return {'win': win_prob, 'draw': draw_prob, 'loss': loss_prob}


def simulate_bracket(seeded_elo: float, unseeded_elos: List[float]) -> Dict:
    """Simulate intercontinental playoff bracket (1 seeded vs 2 unseeded)."""
    team1_elo, team2_elo = unseeded_elos
    team1_win_prob = elo_win_probability(team1_elo, team2_elo)

    # Expected Elo of semi-final winner
    semifinal_winner_elo = team1_win_prob * team1_elo + (1 - team1_win_prob) * team2_elo

    # Final: seeded vs semi-final winner
    seeded_win_prob = elo_win_probability(seeded_elo, semifinal_winner_elo)

    # Expected winner Elo
    expected_winner_elo = seeded_win_prob * seeded_elo + (1 - seeded_win_prob) * semifinal_winner_elo

    return {
        'expected_elo': round(expected_winner_elo),
        'seeded_win_prob': seeded_win_prob,
        'unseeded1_win_prob': (1 - seeded_win_prob) * team1_win_prob,
        'unseeded2_win_prob': (1 - seeded_win_prob) * (1 - team1_win_prob)
    }


def simulate_uefa_path(team_elos: List[float]) -> Dict:
    """Simulate UEFA playoff path (4 teams, seeded 1v4 and 2v3)."""
    sorted_elos = sorted(team_elos, reverse=True)
    t1, t2, t3, t4 = sorted_elos

    # Semi-finals
    sf1_t1_win = elo_win_probability(t1, t4)
    sf2_t2_win = elo_win_probability(t2, t3)

    # Final probabilities
    t1_wins = sf1_t1_win * (sf2_t2_win * elo_win_probability(t1, t2) +
                            (1 - sf2_t2_win) * elo_win_probability(t1, t3))
    t4_wins = (1 - sf1_t1_win) * (sf2_t2_win * elo_win_probability(t4, t2) +
                                  (1 - sf2_t2_win) * elo_win_probability(t4, t3))
    t2_wins = sf2_t2_win * (sf1_t1_win * elo_win_probability(t2, t1) +
                            (1 - sf1_t1_win) * elo_win_probability(t2, t4))
    t3_wins = (1 - sf2_t2_win) * (sf1_t1_win * elo_win_probability(t3, t1) +
                                  (1 - sf1_t1_win) * elo_win_probability(t3, t4))

    expected_elo = t1 * t1_wins + t2 * t2_wins + t3 * t3_wins + t4 * t4_wins

    return {
        'expected_elo': round(expected_elo),
        'probs_sum': t1_wins + t2_wins + t3_wins + t4_wins,
        'team_probs': sorted([t1_wins, t2_wins, t3_wins, t4_wins], reverse=True)
    }


def simulate_group_monte_carlo(team_elos: List[Tuple[str, float]], iterations: int = MC_ITERATIONS) -> Dict:
    """Run Monte Carlo simulation for a 4-team group."""
    stats = {code: {'wins': 0, 'draws': 0, 'losses': 0, 'points': 0,
                    'positions': [0, 0, 0, 0]} for code, _ in team_elos}

    # Generate match pairings (6 matches in 4-team group)
    matches = []
    for i in range(len(team_elos)):
        for j in range(i + 1, len(team_elos)):
            matches.append((team_elos[i], team_elos[j]))

    for _ in range(iterations):
        sim_points = {code: 0 for code, _ in team_elos}
        sim_wdl = {code: [0, 0, 0] for code, _ in team_elos}  # wins, draws, losses

        for (code_a, elo_a), (code_b, elo_b) in matches:
            probs = get_match_probabilities(elo_a, elo_b)
            rand = random.random()

            if rand < probs['win']:
                sim_points[code_a] += 3
                sim_wdl[code_a][0] += 1
                sim_wdl[code_b][2] += 1
            elif rand < probs['win'] + probs['draw']:
                sim_points[code_a] += 1
                sim_points[code_b] += 1
                sim_wdl[code_a][1] += 1
                sim_wdl[code_b][1] += 1
            else:
                sim_points[code_b] += 3
                sim_wdl[code_b][0] += 1
                sim_wdl[code_a][2] += 1

        for code, _ in team_elos:
            stats[code]['wins'] += sim_wdl[code][0]
            stats[code]['draws'] += sim_wdl[code][1]
            stats[code]['losses'] += sim_wdl[code][2]
            stats[code]['points'] += sim_points[code]

        standings = sorted(team_elos, key=lambda x: sim_points[x[0]], reverse=True)
        for idx, (code, _) in enumerate(standings):
            stats[code]['positions'][idx] += 1

    # Calculate averages
    results = {}
    for code, elo in team_elos:
        s = stats[code]
        results[code] = {
            'elo': elo,
            'avg_wins': s['wins'] / iterations,
            'avg_draws': s['draws'] / iterations,
            'avg_losses': s['losses'] / iterations,
            'avg_points': s['points'] / iterations,
            'pos1_prob': s['positions'][0] / iterations,
            'pos2_prob': s['positions'][1] / iterations,
            'pos3_prob': s['positions'][2] / iterations,
            'pos4_prob': s['positions'][3] / iterations
        }
    return results


# =============================================================================
# Server Data Fetching
# =============================================================================

def fetch_json(endpoint: str) -> dict:
    """Fetch JSON data from server endpoint."""
    url = f"{SERVER_URL}{endpoint}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        raise


# =============================================================================
# Test Suite
# =============================================================================

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []

    def add(self, name: str, passed: bool, message: str = ""):
        self.tests.append((name, passed, message))
        if passed:
            self.passed += 1
        else:
            self.failed += 1

    def report(self):
        print("\n" + "=" * 70)
        print("TEST RESULTS SUMMARY")
        print("=" * 70)

        # Group by category
        failed_tests = [(n, m) for n, p, m in self.tests if not p]

        if failed_tests:
            print("\nFAILED TESTS:")
            for name, message in failed_tests:
                print(f"  [FAIL] {name}")
                if message:
                    print(f"         {message}")

        print("-" * 70)
        print(f"Total: {self.passed + self.failed} | Passed: {self.passed} | Failed: {self.failed}")
        print("=" * 70)
        return self.failed == 0


def test_server_connection(results: TestResults) -> bool:
    """Test that server is running and responding."""
    print("\n--- Testing Server Connection ---")
    try:
        data = fetch_json("/api/groups")
        results.add("Server responds to /api/groups", True)
        return True
    except Exception as e:
        results.add("Server responds to /api/groups", False, str(e))
        return False


def test_rankings_data(results: TestResults) -> dict:
    """Test rankings endpoint and return data for further tests."""
    print("\n--- Testing Rankings Data ---")
    try:
        data = fetch_json("/api/rankings")
        rankings = data.get('rankings', [])

        results.add("Rankings endpoint returns data", len(rankings) > 0,
                    f"Got {len(rankings)} teams")

        if rankings:
            team = rankings[0]
            has_required = all(k in team for k in ['code', 'rating', 'name'])
            results.add("Rankings have required fields", has_required)

            ratings_valid = all(1000 <= r['rating'] <= 2200 for r in rankings[:10])
            results.add("Top 10 ratings in valid range (1000-2200)", ratings_valid)

        return {r['code']: r['rating'] for r in rankings}
    except Exception as e:
        results.add("Rankings endpoint error", False, str(e))
        return {}


def test_sos_endpoint(results: TestResults, ratings: dict):
    """Test SoS endpoint and validate probability calculations."""
    print("\n--- Testing SoS Endpoint ---")
    try:
        data = fetch_json("/api/sos")

        results.add("SoS endpoint returns data", 'teams' in data)
        results.add("SoS has group simulation data", 'groupSimulation' in data)
        results.add("SoS has playoff simulation data", 'playoffSimulation' in data)

        if 'playoffSimulation' in data:
            test_playoff_probabilities(results, data['playoffSimulation'], ratings)

        if 'groupSimulation' in data:
            test_group_simulation_validity(results, data['groupSimulation'])

        return data
    except Exception as e:
        results.add("SoS endpoint error", False, str(e))
        return {}


def test_playoff_probabilities(results: TestResults, playoff_sim: dict, ratings: dict):
    """Validate playoff simulation probability calculations."""
    print("\n--- Testing Playoff Probability Calculations ---")

    for bracket_name, bracket in playoff_sim.get('intercontinental', {}).items():
        teams = bracket.get('teams', [])
        if len(teams) >= 3:
            prob_sum = sum(t['prob'] for t in teams)
            results.add(
                f"IC {bracket_name}: probs sum to 1",
                abs(prob_sum - 1.0) < 0.001,
                f"Sum was {prob_sum:.4f}"
            )

            seeded = teams[0]
            unseeded = [t for t in teams if t != seeded]

            if len(unseeded) == 2:
                local_sim = simulate_bracket(
                    seeded['elo'],
                    [unseeded[0]['elo'], unseeded[1]['elo']]
                )

                server_expected = bracket.get('expectedElo', 0)
                local_expected = local_sim['expected_elo']

                results.add(
                    f"IC {bracket_name}: expected Elo matches",
                    abs(server_expected - local_expected) <= 1,
                    f"Server: {server_expected}, Local: {local_expected}"
                )

    for path_name, path in playoff_sim.get('uefa', {}).items():
        teams = path.get('teams', [])
        if len(teams) == 4:
            prob_sum = sum(t['prob'] for t in teams)
            results.add(
                f"UEFA {path_name}: probs sum to 1",
                abs(prob_sum - 1.0) < 0.001,
                f"Sum was {prob_sum:.4f}"
            )

            team_elos = [t['elo'] for t in teams]
            local_sim = simulate_uefa_path(team_elos)

            server_expected = path.get('expectedElo', 0)
            local_expected = local_sim['expected_elo']

            results.add(
                f"UEFA {path_name}: expected Elo matches",
                abs(server_expected - local_expected) <= 1,
                f"Server: {server_expected}, Local: {local_expected}"
            )


def test_group_simulation_validity(results: TestResults, group_sim: dict):
    """Validate group simulation data structure and basic constraints."""
    print("\n--- Testing Group Simulation Validity (All 12 Groups) ---")

    for group_name in sorted(group_sim.keys()):
        group_data = group_sim.get(group_name, [])
        if not group_data:
            continue

        # Check position probabilities sum to 1 for each team
        for team in group_data:
            pos_sum = (team.get('pos1Prob', 0) + team.get('pos2Prob', 0) +
                       team.get('pos3Prob', 0) + team.get('pos4Prob', 0))
            results.add(
                f"Group {group_name} {team.get('code', '?')}: position probs sum to 1",
                abs(pos_sum - 1.0) < 0.01,
                f"Sum was {pos_sum:.4f}"
            )

        # Check total position probabilities across all teams
        for pos in range(1, 5):
            pos_key = f'pos{pos}Prob'
            total = sum(t.get(pos_key, 0) for t in group_data)
            results.add(
                f"Group {group_name}: position {pos} total = 1",
                abs(total - 1.0) < 0.01,
                f"Total was {total:.4f}"
            )

        # Check r32Prob >= pos1 + pos2
        for team in group_data:
            min_qualify = team.get('pos1Prob', 0) + team.get('pos2Prob', 0)
            server_r32 = team.get('r32Prob', 0)
            results.add(
                f"Group {group_name} {team.get('code', '?')}: r32Prob >= pos1+pos2",
                server_r32 >= min_qualify - 0.001,
                f"r32Prob: {server_r32:.4f}, pos1+pos2: {min_qualify:.4f}"
            )

        # Check tournament progression is monotonically decreasing
        for team in group_data:
            r32 = team.get('r32Prob', 0)
            r16 = team.get('r16Prob', 0)
            qf = team.get('qfProb', 0)
            sf = team.get('sfProb', 0)
            final = team.get('finalProb', 0)
            win = team.get('winProb', 0)

            probs_decrease = r32 >= r16 >= qf >= sf >= final >= win
            results.add(
                f"Group {group_name} {team.get('code', '?')}: tournament probs decrease",
                probs_decrease,
                f"R32:{r32:.3f} R16:{r16:.3f} QF:{qf:.3f} SF:{sf:.3f} F:{final:.3f} W:{win:.3f}"
            )


def run_comprehensive_monte_carlo_comparison(group_sim: dict, results: TestResults) -> Dict:
    """
    Run local Monte Carlo simulations for ALL 12 groups and compare to server.
    Returns detailed comparison data for display.
    """
    print("\n" + "=" * 70)
    print("COMPREHENSIVE MONTE CARLO COMPARISON")
    print(f"Running {MC_ITERATIONS:,} iterations per group for all 12 groups...")
    print("=" * 70)

    comparison_data = {}
    tolerance = 0.02  # 2% tolerance for MC variance

    all_groups = sorted(group_sim.keys())

    for group_name in all_groups:
        group_data = group_sim.get(group_name, [])
        if not group_data or len(group_data) != 4:
            continue

        print(f"\nSimulating Group {group_name}...", end=" ", flush=True)

        # Get team elos from server data
        team_elos = [(t['code'], t['elo']) for t in group_data]

        # Run local Monte Carlo
        local_results = simulate_group_monte_carlo(team_elos, iterations=MC_ITERATIONS)

        print("Done.")

        # Store comparison for this group
        group_comparison = []

        for team in sorted(group_data, key=lambda x: x['elo'], reverse=True):
            code = team['code']
            name = team.get('name', code)
            local = local_results.get(code, {})

            comparison = {
                'code': code,
                'name': name,
                'elo': team['elo'],
                'server': {
                    'pos1': team.get('pos1Prob', 0),
                    'pos2': team.get('pos2Prob', 0),
                    'pos3': team.get('pos3Prob', 0),
                    'pos4': team.get('pos4Prob', 0),
                },
                'local': {
                    'pos1': local.get('pos1_prob', 0),
                    'pos2': local.get('pos2_prob', 0),
                    'pos3': local.get('pos3_prob', 0),
                    'pos4': local.get('pos4_prob', 0),
                    'avg_wins': local.get('avg_wins', 0),
                    'avg_draws': local.get('avg_draws', 0),
                    'avg_losses': local.get('avg_losses', 0),
                    'avg_points': local.get('avg_points', 0),
                },
                'diffs': {}
            }

            # Calculate differences
            for pos in ['pos1', 'pos2', 'pos3', 'pos4']:
                diff = abs(comparison['server'][pos] - comparison['local'][pos])
                comparison['diffs'][pos] = diff

                # Add test result
                passed = diff < tolerance
                results.add(
                    f"Group {group_name} {code}: {pos} within {tolerance*100:.0f}%",
                    passed,
                    f"Server: {comparison['server'][pos]:.4f}, Local: {comparison['local'][pos]:.4f}, Diff: {diff:.4f}"
                )

            group_comparison.append(comparison)

        comparison_data[group_name] = group_comparison

    return comparison_data


def display_monte_carlo_comparison(comparison_data: Dict):
    """Display detailed Monte Carlo comparison results."""
    print("\n" + "=" * 100)
    print("DETAILED MONTE CARLO COMPARISON RESULTS")
    print("=" * 100)

    total_comparisons = 0
    total_within_1pct = 0
    total_within_2pct = 0
    max_diff = 0
    max_diff_info = ""

    for group_name in sorted(comparison_data.keys()):
        group = comparison_data[group_name]

        print(f"\n{'─' * 100}")
        print(f"GROUP {group_name}")
        print(f"{'─' * 100}")
        print(f"{'Team':<20} {'Elo':>5} │ {'Metric':<6} │ {'Server':>8} │ {'Local':>8} │ {'Diff':>7} │ {'Status':<6}")
        print(f"{'─' * 100}")

        for team in group:
            first_row = True
            for pos in ['pos1', 'pos2', 'pos3', 'pos4']:
                server_val = team['server'][pos]
                local_val = team['local'][pos]
                diff = team['diffs'][pos]

                total_comparisons += 1
                if diff < 0.01:
                    total_within_1pct += 1
                if diff < 0.02:
                    total_within_2pct += 1

                if diff > max_diff:
                    max_diff = diff
                    max_diff_info = f"Group {group_name} {team['code']} {pos}"

                status = "OK" if diff < 0.02 else "WARN" if diff < 0.03 else "FAIL"

                if first_row:
                    print(f"{team['name']:<20} {team['elo']:>5} │ {pos:<6} │ {server_val*100:>7.2f}% │ {local_val*100:>7.2f}% │ {diff*100:>6.2f}% │ {status:<6}")
                    first_row = False
                else:
                    print(f"{'':<20} {'':<5} │ {pos:<6} │ {server_val*100:>7.2f}% │ {local_val*100:>7.2f}% │ {diff*100:>6.2f}% │ {status:<6}")

            # Show local simulation stats (wins/draws/losses/points)
            local = team['local']
            print(f"{'':<20} {'':<5} │ {'W/D/L':<6} │ {local['avg_wins']:>7.2f}  │ {local['avg_draws']:>7.2f}  │ {local['avg_losses']:>6.2f}  │")
            print(f"{'':<20} {'':<5} │ {'Pts':<6} │ {local['avg_points']:>7.2f}  │ {'':<8} │ {'':<7} │")
            print()

    # Summary statistics
    print("\n" + "=" * 100)
    print("COMPARISON SUMMARY")
    print("=" * 100)
    print(f"Total position comparisons: {total_comparisons}")
    print(f"Within 1% tolerance: {total_within_1pct} ({total_within_1pct/total_comparisons*100:.1f}%)")
    print(f"Within 2% tolerance: {total_within_2pct} ({total_within_2pct/total_comparisons*100:.1f}%)")
    print(f"Maximum difference: {max_diff*100:.2f}% ({max_diff_info})")
    print("=" * 100)


def test_win_probability_edge_cases(results: TestResults):
    """Test edge cases in probability calculations."""
    print("\n--- Testing Probability Edge Cases ---")

    probs = get_match_probabilities(1600, 1600)
    results.add(
        "Equal teams: win == loss",
        abs(probs['win'] - probs['loss']) < 0.0001
    )

    for diff in [0, 100, 500, 1000]:
        probs = get_match_probabilities(1600 + diff, 1600)
        total = probs['win'] + probs['draw'] + probs['loss']
        results.add(
            f"Elo diff {diff}: probs sum to 1",
            abs(total - 1.0) < 0.0001,
            f"Sum was {total:.6f}"
        )
        results.add(
            f"Elo diff {diff}: all probs in [0,1]",
            all(0 <= p <= 1 for p in probs.values())
        )


def display_server_data_summary(data: dict):
    """Display summary of server data for reference."""
    print("\n" + "=" * 70)
    print("SERVER DATA SUMMARY")
    print("=" * 70)

    if 'teams' in data:
        print(f"\nTeams in SoS ranking: {len(data['teams'])}")
        print("Top 5 by SoS (hardest schedule):")
        for team in data['teams'][:5]:
            print(f"  {team.get('name', team['code']):20} | SoS: {team['groupOpponentSoS']} | "
                  f"Elo: {team['elo']} | Group: {team['group']}")

    if 'playoffSimulation' in data:
        sim = data['playoffSimulation']
        print("\nPlayoff Simulations:")
        for name, bracket in sim.get('intercontinental', {}).items():
            print(f"\n  Intercontinental {name} -> Group {bracket['destinationGroup']}:")
            print(f"    Expected Elo: {bracket['expectedElo']}")
            for team in bracket['teams']:
                print(f"    {team.get('name', team['code']):20} ({team['elo']}) - "
                      f"{team['prob']*100:.1f}%")

        for name, path in sim.get('uefa', {}).items():
            print(f"\n  UEFA {name} -> Group {path['destinationGroup']}:")
            print(f"    Expected Elo: {path['expectedElo']}")
            for team in path['teams']:
                print(f"    {team.get('name', team['code']):20} ({team['elo']}) - "
                      f"{team['prob']*100:.1f}%")


def main():
    print("=" * 70)
    print("SERVER WIN PROBABILITY VERIFICATION")
    print("=" * 70)
    print(f"\nConnecting to server at {SERVER_URL}")
    print(f"Monte Carlo iterations per group: {MC_ITERATIONS:,}")

    results = TestResults()

    # Test server connection
    if not test_server_connection(results):
        print("\nERROR: Cannot connect to server. Make sure it's running:")
        print("  node server.js")
        results.report()
        return 1

    # Get rankings data
    ratings = test_rankings_data(results)

    # Test SoS endpoint and probability calculations
    sos_data = test_sos_endpoint(results, ratings)

    # Test edge cases
    test_win_probability_edge_cases(results)

    # Run comprehensive Monte Carlo comparison for ALL groups
    if 'groupSimulation' in sos_data:
        comparison_data = run_comprehensive_monte_carlo_comparison(
            sos_data['groupSimulation'], results
        )

        # Display detailed comparison
        display_monte_carlo_comparison(comparison_data)

    # Report test results
    all_passed = results.report()

    # Display server data summary
    if sos_data:
        display_server_data_summary(sos_data)

    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
