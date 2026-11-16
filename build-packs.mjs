// Compile the macro compendium from JSON source into a Foundry LevelDB pack.
// Usage (from the repo root):  npm install --no-save @foundryvtt/foundryvtt-cli && node build-packs.mjs
// Source of truth: packs/_source/macros/*.json   Output: packs/macros/ (commit both)
import { compilePack } from '@foundryvtt/foundryvtt-cli';

await compilePack('packs/_source/macros', 'packs/macros', { log: true });
