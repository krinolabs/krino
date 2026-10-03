// The spend guard. Before starting: refuse when the estimate is over --max-spend-usd. While
// running: stop before a run once spend has reached the limit, or when the run's estimate would
// take it over. A run that costs more than its estimate can overshoot by that one run.

function usdText(amountInUsd: number): string {
  return `$${amountInUsd.toFixed(2)}`;
}

export type EstimateCheckInputs = {
  estimatedInUsd: number;
  limitInUsd: number;
  /** What `--pilot` would cost with the same setups and tool counts; `null` when running it. */
  pilotEstimateInUsd: number | null;
};

export type EstimateCheck = { withinLimit: true } | { withinLimit: false; message: string };

export function checkEstimate(checkInputs: EstimateCheckInputs): EstimateCheck {
  if (checkInputs.estimatedInUsd <= checkInputs.limitInUsd) {
    return { withinLimit: true };
  }
  const pilotHint =
    checkInputs.pilotEstimateInUsd === null
      ? ""
      : `--pilot (estimated ${usdText(checkInputs.pilotEstimateInUsd)}) or `;
  return {
    withinLimit: false,
    message:
      `krino-bench: the estimated cost is ${usdText(checkInputs.estimatedInUsd)}, over ` +
      `--max-spend-usd ${usdText(checkInputs.limitInUsd)}. Nothing was run. ` +
      `Try ${pilotHint}a higher --max-spend-usd.`,
  };
}

export type StopCheckInputs = {
  spentInUsd: number;
  nextRunEstimateInUsd: number;
  limitInUsd: number;
};

export function shouldStopBeforeRun(stopInputs: StopCheckInputs): boolean {
  return (
    stopInputs.spentInUsd >= stopInputs.limitInUsd ||
    stopInputs.spentInUsd + stopInputs.nextRunEstimateInUsd > stopInputs.limitInUsd
  );
}

export type StopMessageInputs = {
  spentInUsd: number;
  limitInUsd: number;
  finishedRunCount: number;
  plannedRunCount: number;
};

export function spendLimitStopMessage(messageInputs: StopMessageInputs): string {
  return (
    `krino-bench: stopped at the spend limit: spent ${usdText(messageInputs.spentInUsd)} of ` +
    `--max-spend-usd ${usdText(messageInputs.limitInUsd)} after ${messageInputs.finishedRunCount} ` +
    `of ${messageInputs.plannedRunCount} runs. The results cover the finished runs only.`
  );
}
