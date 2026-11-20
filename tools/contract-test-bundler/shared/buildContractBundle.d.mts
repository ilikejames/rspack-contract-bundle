export interface BuildContractBundleOptions {
  entry: string;
  outDir: string;
  filename: string;
  harnessPath: string;
  shebang?: boolean;
}

export function buildContractBundle(options: BuildContractBundleOptions): Promise<void>;
