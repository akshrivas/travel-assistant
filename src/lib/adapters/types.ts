import type {
  NormalizedTravelOption,
  SourceAdapterSearchInput,
} from "@/lib/types/travel";

/**
 * Pluggable market source. Swap adapters without changing core engine.
 */
export interface SourceAdapter {
  id: string;
  name: string;
  type: NormalizedTravelOption["source"]["type"];
  /** Markets this adapter can serve (ISO country codes). Empty = unrestricted. */
  markets: string[];
  search(input: SourceAdapterSearchInput): Promise<NormalizedTravelOption[]>;
}
