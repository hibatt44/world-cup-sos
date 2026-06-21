const assert = require('node:assert/strict');

function classList() {
    const values = new Set();
    return {
        add: value => values.add(value),
        toggle: (value, force) => force ? values.add(value) : values.delete(value),
        contains: value => values.has(value)
    };
}

function element() {
    return {
        innerHTML: '',
        textContent: '',
        attributes: {},
        handlers: {},
        classList: classList(),
        addEventListener(type, handler) { this.handlers[type] = handler; },
        setAttribute(name, value) { this.attributes[name] = value; },
        replaceChildren(child) { this.textContent = child.textContent; }
    };
}

const elements = {
    statusPill: element(),
    pathSummary: element(),
    bracketBoard: element(),
    showAllButton: element()
};

global.document = {
    querySelector(selector) { return elements[selector.slice(1)]; },
    createElement() { return element(); }
};

const selected = {
    code: 'XX',
    name: '<img src=x onerror=alert(1)>',
    elo: 1500,
    r32Prob: 0.9,
    r16Prob: 0.6,
    qfProb: 0.4,
    sfProb: 0.2,
    finalProb: 0.1,
    winProb: 0.05
};

function forecast(match, nextMatch, selectedProbability, opponentName) {
    return {
        match,
        nextMatch,
        contenders: [
            { code: 'XX', name: selected.name, probability: selectedProbability },
            { code: `O${match}`, name: opponentName, probability: 0.7 }
        ],
        slots: [
            {
                source: match <= 2 ? '1A' : match - 1,
                contenders: [{ code: 'XX', name: selected.name, probability: selectedProbability }]
            },
            {
                source: match <= 2 ? '2B' : match - 2,
                contenders: [{ code: `O${match}`, name: opponentName, probability: 1 }]
            }
        ],
        opponentsByTeam: {
            XX: [{ code: `O${match}`, name: opponentName, probability: 1 }]
        }
    };
}

const data = {
    simulationCount: 100,
    worldCupSchedule: {
        knockout: Object.fromEntries([1, 2, 10, 11, 20, 21, 30, 31, 40].map(match => [
            match,
            { officialMatch: match + 72, date: '2026-07-01', venue: `Venue ${match}` }
        ]))
    },
    groupSimulation: { A: [selected] },
    bracketForecast: {
        r32: [forecast(1, 10, 0.4, 'Wrong branch'), forecast(2, 11, 0.6, 'Opening opponent')],
        r16: [forecast(10, 20, 0.35, 'Wrong opponent'), forecast(11, 21, 0.2, 'Correct opponent')],
        qf: [forecast(20, 31, 0.3, 'Wrong quarterfinal'), forecast(21, 30, 0.1, 'Quarterfinal opponent')],
        sf: [forecast(30, 40, 0.05, 'Semifinal opponent'), forecast(31, 40, 0.2, 'Wrong semifinal')],
        final: [forecast(40, undefined, 0.02, 'Final opponent')]
    }
};

global.fetch = async () => ({ ok: true, json: async () => data });

(async () => {
    require('./public/bracket.js');
    await new Promise(resolve => setImmediate(resolve));

    assert.ok(!elements.pathSummary.innerHTML.includes('<img'));
    assert.ok(!elements.bracketBoard.innerHTML.includes('<img'));
    assert.match(elements.bracketBoard.innerHTML, /data-team-code="XX"/);
    assert.match(elements.bracketBoard.innerHTML, /aria-pressed="true"/);
    assert.match(elements.pathSummary.innerHTML, /Round of 16: Correct opponent/);
    assert.doesNotMatch(elements.pathSummary.innerHTML, /Round of 16: Wrong opponent/);

    const pathMatches = [...elements.bracketBoard.innerHTML.matchAll(/bracket-match on-path[^>]*>[\s\S]*?Bracket (\d+)/g)]
        .map(match => Number(match[1]));
    assert.deepEqual(pathMatches, [2, 11, 21, 30, 40]);
    assert.match(elements.bracketBoard.innerHTML, /Wed, Jul 1/);
    assert.match(elements.bracketBoard.innerHTML, /Venue 2/);
    assert.match(elements.bracketBoard.innerHTML, /Slot 1 · Group A winner/);

    elements.showAllButton.handlers.click();
    assert.equal(elements.showAllButton.attributes['aria-pressed'], 'true');
    assert.ok(elements.bracketBoard.classList.contains('is-focused'));

    console.log('Bracket page tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
