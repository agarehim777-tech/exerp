import { assertE2eTarget } from '../tests/e2e-target.mjs';

assertE2eTarget(process.env);
console.log('Dedicated E2E project and tenant configured.');
