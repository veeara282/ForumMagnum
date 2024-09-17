import { highlightReviewWinnerThresholdSetting } from "./instanceSettings";

export type AnnualReviewMarketInfo = {
  probability: number;
  isResolved: boolean;
  year: number;
  url: string;
}

export const getMarketInfo = (post: PostsBase): AnnualReviewMarketInfo | undefined => {
  if (typeof post.annualReviewMarketProbability !== 'number') return undefined
  if (typeof post.annualReviewMarketIsResolved !== 'boolean') return undefined
  if (typeof post.annualReviewMarketYear !== 'number') return undefined
  if (typeof post.annualReviewMarketUrl !== 'string') return undefined
  return {
    probability: post.annualReviewMarketProbability,
    isResolved: post.annualReviewMarketIsResolved,
    year: post.annualReviewMarketYear,
    url: post.annualReviewMarketUrl,
  }
}

export const highlightMarket = (info: AnnualReviewMarketInfo | undefined): boolean =>
  !!info && !info.isResolved && info.probability > highlightReviewWinnerThresholdSetting.get()
