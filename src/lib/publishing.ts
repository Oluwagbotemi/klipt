/* Settings › Publishing: shapes shared by the server and the settings screen (client-safe). */

export interface PublishingType {
  key: string;
  name: string;
  pattern: string;
  defaultPattern: string;
  /** Published entries, i.e. URLs that move if the pattern changes. */
  live: number;
}

export interface PublishingSettings {
  requireReview: boolean;
  defaultModelKey: string;
  timeZone: string;
  domain: string | null;
  previewUrl: string | null;
  types: PublishingType[];
  /** Fixed term archive addresses, shown so people know what's taken. */
  archives: { key: string; name: string; pattern: string }[];
}

export interface PatternChange {
  key: string;
  name: string;
  from: string;
  to: string;
  /** Live entries whose address changes. */
  moving: number;
  example: { from: string; to: string } | null;
}
