#!/usr/bin/env python3
"""
Win Probability Calculator Verification Script

This script verifies the win probability calculations used in the Soccer Elo
World Cup 2026 analyzer. It tests:
1. Basic Elo win probability formula
2. Three-outcome model (win/draw/loss) for group matches
3. Edge cases and mathematical properties
4. Monte Carlo simulation consistency
"""

import math
import random
from typing import Tuple, Dict
from dataclasses import dataclass


# =============================================================================
# Core Win Probability Functions (matching sosCalculator.js implementation)
# =============================================================================

def elo_win_probability(rating1: float, rating2: float) -> float:
    """
    Calculate the probability that team1 beats team2 using the standard Elo formula.

    Formula: P(Team1 wins) = 1 / (1 + 10^((Elo2 - Elo1) / 400))

    This matches sosCalculator.js:48-50 and bracketSimulator.js:10
    """
    return 1 / (1 + math.pow(10, (rating2 - rating1) / 400))


def get_match_probabilities(team_elo: float, opp_elo: float) -> Dict[str, float]:
    """
    Calculate win, draw, and loss probabilities for a group stage match.

    This matches sosCalculator.js:232-245 and app.js:288-301

    The model:
    - Base win expectancy from standard Elo formula
    - Draw probability: 27% at equal ratings, decreasing with Elo gap (min 15%)
    - Redistributes win expectancy across three outcomes
    """
    # Base win probability using Elo formula
    win_expectancy = 1 / (1 + math.pow(10, (opp_elo - team_elo) / 400))

    # Draw probability: ~27% at equal ratings, decreasing with Elo gap (min 15%)
    elo_diff = abs(team_elo - opp_elo)
    draw_prob = max(0.15, 0.27 - elo_diff * 0.0004)

    # Redistribute win expectancy to three outcomes
    win_prob = win_expectancy * (1 - draw_prob)
    loss_prob = (1 - win_expectancy) * (1 - draw_prob)

    return {
        'win': win_prob,
        'draw': draw_prob,
        'loss': loss_prob,
        'win_expectancy': win_expectancy  # Raw Elo value before draw adjustment
    }


# =============================================================================
# Test Suite
# =============================================================================

class TestResults:
    """Track test results."""
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
        print("TEST RESULTS")
        print("=" * 70)

        for name, passed, message in self.tests:
            status = "PASS" if passed else "FAIL"
            print(f"[{status}] {name}")
            if message and not passed:
                print(f"       {message}")

        print("-" * 70)
        print(f"Total: {self.passed + self.failed} | Passed: {self.passed} | Failed: {self.failed}")
        print("=" * 70)
        return self.failed == 0


def test_basic_elo_formula(results: TestResults):
    """Test the basic Elo win probability formula."""
    print("\n--- Testing Basic Elo Formula ---")

    # Test 1: Equal ratings should give 50%
    prob = elo_win_probability(1600, 1600)
    results.add(
        "Equal ratings (1600 vs 1600) = 50%",
        abs(prob - 0.5) < 0.0001,
        f"Expected 0.5, got {prob:.6f}"
    )

    # Test 2: Higher rating should give >50%
    prob = elo_win_probability(1700, 1600)
    results.add(
        "Higher rating (1700 vs 1600) > 50%",
        prob > 0.5,
        f"Expected >0.5, got {prob:.6f}"
    )

    # Test 3: Lower rating should give <50%
    prob = elo_win_probability(1500, 1600)
    results.add(
        "Lower rating (1500 vs 1600) < 50%",
        prob < 0.5,
        f"Expected <0.5, got {prob:.6f}"
    )

    # Test 4: 400 point difference should give ~91% (known value)
    # 1 / (1 + 10^(-1)) = 1 / (1 + 0.1) = 1 / 1.1 = 0.9090909...
    prob = elo_win_probability(2000, 1600)
    expected = 1 / 1.1  # ~0.909090909
    results.add(
        "400 point advantage gives ~90.9%",
        abs(prob - expected) < 0.0001,
        f"Expected {expected:.6f}, got {prob:.6f}"
    )

    # Test 5: Symmetry - probabilities should sum to 1
    prob1 = elo_win_probability(1700, 1600)
    prob2 = elo_win_probability(1600, 1700)
    results.add(
        "Symmetry: P(A beats B) + P(B beats A) = 1",
        abs(prob1 + prob2 - 1.0) < 0.0001,
        f"Sum was {prob1 + prob2:.6f}, expected 1.0"
    )

    # Test 6: 200 point difference
    # 1 / (1 + 10^(-0.5)) = 1 / (1 + ~0.316) = ~0.76
    prob = elo_win_probability(1800, 1600)
    expected = 1 / (1 + math.pow(10, -0.5))
    results.add(
        "200 point advantage gives ~76%",
        abs(prob - expected) < 0.0001,
        f"Expected {expected:.6f}, got {prob:.6f}"
    )


def test_three_outcome_model(results: TestResults):
    """Test the three-outcome (win/draw/loss) model for group matches."""
    print("\n--- Testing Three-Outcome Model ---")

    # Test 1: Probabilities should sum to 1
    probs = get_match_probabilities(1600, 1600)
    total = probs['win'] + probs['draw'] + probs['loss']
    results.add(
        "Probabilities sum to 1 (equal ratings)",
        abs(total - 1.0) < 0.0001,
        f"Sum was {total:.6f}"
    )

    # Test 2: Equal ratings - equal win/loss, draw ~27%
    probs = get_match_probabilities(1600, 1600)
    results.add(
        "Equal ratings: draw probability = 27%",
        abs(probs['draw'] - 0.27) < 0.0001,
        f"Expected 0.27, got {probs['draw']:.6f}"
    )

    results.add(
        "Equal ratings: win = loss",
        abs(probs['win'] - probs['loss']) < 0.0001,
        f"Win: {probs['win']:.6f}, Loss: {probs['loss']:.6f}"
    )

    # Test 3: Large Elo gap - draw should hit floor of 15%
    # Gap of 300+ should give draw = 0.27 - 300*0.0004 = 0.27 - 0.12 = 0.15
    probs = get_match_probabilities(1900, 1600)
    results.add(
        "300+ point gap: draw at minimum 15%",
        abs(probs['draw'] - 0.15) < 0.0001,
        f"Expected 0.15, got {probs['draw']:.6f}"
    )

    # Test 4: Probabilities sum to 1 with different ratings
    for diff in [100, 200, 300, 500]:
        probs = get_match_probabilities(1600 + diff, 1600)
        total = probs['win'] + probs['draw'] + probs['loss']
        results.add(
            f"Probabilities sum to 1 ({diff} point gap)",
            abs(total - 1.0) < 0.0001,
            f"Sum was {total:.6f}"
        )

    # Test 5: Higher rated team has higher win probability
    probs = get_match_probabilities(1700, 1600)
    results.add(
        "Higher rated team has higher win prob",
        probs['win'] > probs['loss'],
        f"Win: {probs['win']:.6f}, Loss: {probs['loss']:.6f}"
    )

    # Test 6: Draw probability decreases with Elo gap
    probs_equal = get_match_probabilities(1600, 1600)
    probs_gap = get_match_probabilities(1700, 1600)
    results.add(
        "Draw prob decreases with Elo gap",
        probs_gap['draw'] < probs_equal['draw'],
        f"Equal: {probs_equal['draw']:.6f}, Gap: {probs_gap['draw']:.6f}"
    )


def test_draw_probability_formula(results: TestResults):
    """Test the draw probability calculation specifically."""
    print("\n--- Testing Draw Probability Formula ---")

    # Test draw probability at various Elo differences
    test_cases = [
        (0, 0.27),      # Equal ratings
        (100, 0.23),    # 0.27 - 100*0.0004 = 0.23
        (200, 0.19),    # 0.27 - 200*0.0004 = 0.19
        (300, 0.15),    # 0.27 - 300*0.0004 = 0.15 (at floor)
        (400, 0.15),    # Floor
        (500, 0.15),    # Floor
    ]

    for diff, expected_draw in test_cases:
        probs = get_match_probabilities(1600 + diff, 1600)
        results.add(
            f"Draw prob at {diff} point gap = {expected_draw*100:.0f}%",
            abs(probs['draw'] - expected_draw) < 0.0001,
            f"Expected {expected_draw:.4f}, got {probs['draw']:.6f}"
        )


def test_edge_cases(results: TestResults):
    """Test edge cases and boundary conditions."""
    print("\n--- Testing Edge Cases ---")

    # Test 1: Very large Elo difference
    probs = get_match_probabilities(2500, 1000)
    total = probs['win'] + probs['draw'] + probs['loss']
    results.add(
        "Very large gap (1500 points): probs sum to 1",
        abs(total - 1.0) < 0.0001,
        f"Sum was {total:.6f}"
    )
    results.add(
        "Very large gap: win prob near ceiling",
        probs['win'] > 0.8,
        f"Win prob was {probs['win']:.6f}"
    )

    # Test 2: Zero/very low ratings
    probs = get_match_probabilities(100, 100)
    total = probs['win'] + probs['draw'] + probs['loss']
    results.add(
        "Low ratings (100 vs 100): probs sum to 1",
        abs(total - 1.0) < 0.0001,
        f"Sum was {total:.6f}"
    )

    # Test 3: Negative difference (reversed teams)
    probs1 = get_match_probabilities(1600, 1700)
    probs2 = get_match_probabilities(1700, 1600)
    results.add(
        "Reversed teams: team1 win = team2 loss",
        abs(probs1['win'] - probs2['loss']) < 0.0001,
        f"Team1 win: {probs1['win']:.6f}, Team2 loss: {probs2['loss']:.6f}"
    )
    results.add(
        "Reversed teams: draws equal",
        abs(probs1['draw'] - probs2['draw']) < 0.0001,
        f"Draw1: {probs1['draw']:.6f}, Draw2: {probs2['draw']:.6f}"
    )


def test_monte_carlo_consistency(results: TestResults):
    """Test that Monte Carlo simulation matches theoretical probabilities."""
    print("\n--- Testing Monte Carlo Consistency ---")

    def simulate_match(team_elo: float, opp_elo: float) -> str:
        """Simulate a single match, matching sosCalculator.js:253-260"""
        probs = get_match_probabilities(team_elo, opp_elo)
        rand = random.random()
        if rand < probs['win']:
            return 'win'
        elif rand < probs['win'] + probs['draw']:
            return 'draw'
        else:
            return 'loss'

    # Run simulations
    iterations = 50000
    test_cases = [
        (1600, 1600, "Equal ratings"),
        (1700, 1600, "100 point gap"),
        (1800, 1600, "200 point gap"),
    ]

    for team_elo, opp_elo, desc in test_cases:
        wins, draws, losses = 0, 0, 0
        for _ in range(iterations):
            result = simulate_match(team_elo, opp_elo)
            if result == 'win':
                wins += 1
            elif result == 'draw':
                draws += 1
            else:
                losses += 1

        expected = get_match_probabilities(team_elo, opp_elo)
        actual_win = wins / iterations
        actual_draw = draws / iterations
        actual_loss = losses / iterations

        # Allow 1% tolerance for Monte Carlo variance
        tolerance = 0.01
        results.add(
            f"MC {desc}: win prob within 1%",
            abs(actual_win - expected['win']) < tolerance,
            f"Expected {expected['win']:.4f}, got {actual_win:.4f}"
        )
        results.add(
            f"MC {desc}: draw prob within 1%",
            abs(actual_draw - expected['draw']) < tolerance,
            f"Expected {expected['draw']:.4f}, got {actual_draw:.4f}"
        )
        results.add(
            f"MC {desc}: loss prob within 1%",
            abs(actual_loss - expected['loss']) < tolerance,
            f"Expected {expected['loss']:.4f}, got {actual_loss:.4f}"
        )


def test_expected_points(results: TestResults):
    """Test expected points calculation for group matches."""
    print("\n--- Testing Expected Points ---")

    def expected_points(team_elo: float, opp_elo: float) -> float:
        """Calculate expected points from a match (3 for win, 1 for draw, 0 for loss)."""
        probs = get_match_probabilities(team_elo, opp_elo)
        return 3 * probs['win'] + 1 * probs['draw'] + 0 * probs['loss']

    # Test 1: Equal teams should expect ~1.365 points (0.365*3 + 0.27*1)
    points = expected_points(1600, 1600)
    # With 27% draw, each team has 36.5% win rate
    # Expected = 0.365*3 + 0.27*1 = 1.095 + 0.27 = 1.365
    expected = 0.365 * 3 + 0.27 * 1
    results.add(
        "Equal teams: expected ~1.365 points",
        abs(points - expected) < 0.001,
        f"Expected {expected:.4f}, got {points:.4f}"
    )

    # Test 2: Better team expects more points
    points_better = expected_points(1700, 1600)
    points_worse = expected_points(1600, 1700)
    results.add(
        "Better team expects more points",
        points_better > points_worse,
        f"Better: {points_better:.4f}, Worse: {points_worse:.4f}"
    )

    # Test 3: Sum of expected points for both teams
    # Should equal 3 * P(win) + 3 * P(loss) + 2 * P(draw) = 3(1-draw) + 2*draw = 3 - draw
    for diff in [0, 100, 200]:
        pts1 = expected_points(1600 + diff, 1600)
        pts2 = expected_points(1600, 1600 + diff)
        probs = get_match_probabilities(1600 + diff, 1600)
        expected_total = 3 - probs['draw']
        results.add(
            f"Points sum ({diff} gap) = 3 - draw_prob",
            abs(pts1 + pts2 - expected_total) < 0.001,
            f"Sum: {pts1 + pts2:.4f}, Expected: {expected_total:.4f}"
        )


def display_probability_table():
    """Display a table of probabilities for reference."""
    print("\n" + "=" * 70)
    print("WIN PROBABILITY REFERENCE TABLE")
    print("=" * 70)
    print(f"{'Elo Diff':<10} {'Win Exp':<12} {'Draw':<10} {'Win':<10} {'Loss':<10}")
    print("-" * 70)

    for diff in [0, 50, 100, 150, 200, 250, 300, 400, 500]:
        probs = get_match_probabilities(1600 + diff, 1600)
        print(f"{diff:<10} {probs['win_expectancy']:<12.4f} {probs['draw']:<10.4f} "
              f"{probs['win']:<10.4f} {probs['loss']:<10.4f}")

    print("=" * 70)
    print("\nNotes:")
    print("- 'Win Exp' is raw Elo expectancy before draw adjustment")
    print("- Draw probability: max(0.15, 0.27 - diff * 0.0004)")
    print("- Win/Loss redistribute the remaining probability")


def main():
    """Run all tests."""
    print("=" * 70)
    print("SOCCER ELO WIN PROBABILITY VERIFICATION")
    print("=" * 70)
    print("\nThis script verifies the win probability calculations used in")
    print("the Soccer Elo World Cup 2026 analyzer application.")
    print("\nFormulas tested:")
    print("1. Basic Elo: P = 1 / (1 + 10^((Elo2 - Elo1) / 400))")
    print("2. Draw prob: max(0.15, 0.27 - |diff| * 0.0004)")
    print("3. Win prob: win_expectancy * (1 - draw_prob)")
    print("4. Loss prob: (1 - win_expectancy) * (1 - draw_prob)")

    results = TestResults()

    # Run all test suites
    test_basic_elo_formula(results)
    test_three_outcome_model(results)
    test_draw_probability_formula(results)
    test_edge_cases(results)
    test_monte_carlo_consistency(results)
    test_expected_points(results)

    # Display results
    all_passed = results.report()

    # Display reference table
    display_probability_table()

    # Exit code
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
