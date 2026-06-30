const assert = require('node:assert/strict');
const worldCupGroups = require('./data/worldCupGroups.json');
const { normalizeEspnScoreboard } = require('./server');

const espnToEloWorldCupField = {
    ALG: 'DZ',
    ARG: 'AR',
    AUS: 'AU',
    AUT: 'AT',
    BEL: 'BE',
    BIH: 'BA',
    BRA: 'BR',
    CAN: 'CA',
    CIV: 'CI',
    COD: 'CD',
    COL: 'CO',
    CPV: 'CV',
    CRO: 'HR',
    CUW: 'CW',
    CZE: 'CZ',
    ECU: 'EC',
    EGY: 'EG',
    ENG: 'EN',
    ESP: 'ES',
    FRA: 'FR',
    GER: 'DE',
    GHA: 'GH',
    HAI: 'HT',
    IRN: 'IR',
    IRQ: 'IQ',
    JOR: 'JO',
    JPN: 'JP',
    KOR: 'KR',
    KSA: 'SA',
    MAR: 'MA',
    MEX: 'MX',
    NED: 'NL',
    NOR: 'NO',
    NZL: 'NZ',
    PAN: 'PA',
    PAR: 'PY',
    POR: 'PT',
    QAT: 'QA',
    RSA: 'ZA',
    SCO: 'SQ',
    SEN: 'SN',
    SUI: 'CH',
    SWE: 'SE',
    TUN: 'TN',
    TUR: 'TR',
    URU: 'UY',
    USA: 'US',
    UZB: 'UZ'
};

const fieldCodes = new Set(Object.values(worldCupGroups.groups).flatMap(group => group.teams));
const expectedCodes = new Set(Object.values(espnToEloWorldCupField));

assert.equal(Object.keys(espnToEloWorldCupField).length, 48);
assert.deepEqual([...expectedCodes].sort(), [...fieldCodes].sort());

const scoreboard = {
    events: Object.entries(espnToEloWorldCupField).map(([espnCode, eloCode]) => ({
        id: `country-code-${espnCode}`,
        name: `${espnCode} mapping`,
        date: '2026-06-30T12:00Z',
        competitions: [{
            status: { type: { state: 'pre', completed: false } },
            competitors: [{
                homeAway: 'home',
                score: '0',
                winner: false,
                team: {
                    abbreviation: espnCode,
                    displayName: eloCode
                }
            }]
        }]
    }))
};

const normalizedCodes = normalizeEspnScoreboard(scoreboard)
    .flatMap(event => event.competitors)
    .map(team => [team.espnCode, team.code]);

assert.deepEqual(Object.fromEntries(normalizedCodes), espnToEloWorldCupField);

console.log('Country code tests passed');
