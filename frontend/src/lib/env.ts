export const isDemo = !(
  process.env.NEXT_PUBLIC_VAMM_CONTRACT &&
  process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT
);