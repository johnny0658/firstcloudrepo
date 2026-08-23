/**
 * Ordinary least squares via normal equations + Cholesky decomposition.
 * X is small (n x <=5) so this is numerically comfortable; no SVD needed.
 */

export interface OlsResult {
  beta: number[]; // intercept first
  se: number[];
  tStats: number[];
  r2: number;
  adjR2: number;
  residualStd: number;
  n: number;
}

function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const l: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error("matrix not positive definite (collinear regressors?)");
        l[i][j] = Math.sqrt(sum);
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  return l;
}

function choleskySolve(l: number[][], b: number[]): number[] {
  const n = l.length;
  const y = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i][k] * y[k];
    y[i] = sum / l[i][i];
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= l[k][i] * x[k];
    x[i] = sum / l[i][i];
  }
  return x;
}

function invertViaCholesky(l: number[][]): number[][] {
  const n = l.length;
  const inv: number[][] = [];
  for (let col = 0; col < n; col++) {
    const e = Array(n).fill(0);
    e[col] = 1;
    inv.push(choleskySolve(l, e));
  }
  // inv currently holds columns as rows; the matrix is symmetric so transpose is itself
  return inv;
}

/**
 * Regress y on the columns of x (an intercept column is prepended automatically).
 */
export function ols(y: number[], x: number[][]): OlsResult {
  const n = y.length;
  if (x.length !== n) throw new Error("x and y length mismatch");
  const k = (x[0]?.length ?? 0) + 1;
  if (n <= k) throw new Error(`need more than ${k} observations, got ${n}`);

  const design = x.map((row) => [1, ...row]);
  const xtx: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += design[i][a] * y[i];
      for (let b = a; b < k; b++) xtx[a][b] += design[i][a] * design[i][b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];

  const l = cholesky(xtx);
  const beta = choleskySolve(l, xty);
  const xtxInv = invertViaCholesky(l);

  let ssRes = 0;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    let fit = 0;
    for (let a = 0; a < k; a++) fit += design[i][a] * beta[a];
    ssRes += (y[i] - fit) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const dof = n - k;
  const sigma2 = ssRes / dof;
  const se = xtxInv.map((row, i) => Math.sqrt(sigma2 * row[i]));
  const tStats = beta.map((b, i) => (se[i] === 0 ? 0 : b / se[i]));
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    beta,
    se,
    tStats,
    r2,
    adjR2: ssTot === 0 ? 0 : 1 - ((1 - r2) * (n - 1)) / dof,
    residualStd: Math.sqrt(sigma2),
    n,
  };
}
