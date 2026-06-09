const MIN_DRAW_PROBABILITY = 0.15;
const DRAW_PROBABILITY_RANGE = 0.12;
const DRAW_DECAY_RATE = 0.004;

function eloWinProbability(rating1, rating2) {
  return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
}

function drawProbability(rating1, rating2) {
  const eloDiff = Math.abs(rating1 - rating2);
  return MIN_DRAW_PROBABILITY + DRAW_PROBABILITY_RANGE * Math.exp(-DRAW_DECAY_RATE * eloDiff);
}

function getMatchProbabilities(teamElo, oppElo) {
  const winExpectancy = eloWinProbability(teamElo, oppElo);
  const drawProb = drawProbability(teamElo, oppElo);
  const winProb = winExpectancy * (1 - drawProb);
  const lossProb = (1 - winExpectancy) * (1 - drawProb);

  return {
    winProb,
    drawProb,
    lossProb,
    winExpectancy
  };
}

function expectedPoints(teamElo, oppElo) {
  const { winProb, drawProb } = getMatchProbabilities(teamElo, oppElo);
  return winProb * 3 + drawProb;
}

module.exports = {
  eloWinProbability,
  drawProbability,
  getMatchProbabilities,
  expectedPoints
};
