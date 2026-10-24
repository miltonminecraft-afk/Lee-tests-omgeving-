import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredCredits, safeCreditUrl} from '../js/site-credits.js';
test('credits follow placements across rooms, deduplicate and exclude optional CC0 credits', () => {
  const gallery = {rooms:[{plants:[{asset:'fern'}, {asset:'fern'}], furniture:[{asset:'table'}]}, {trees:[{asset:'fern'}], surfaces:{floor:{asset:'stone'}}}]};
  const entries = [{id:'fern',credit:'Maker',license:'CC BY 4.0',changes:'Converted to splats',path:'private/file'}, {id:'table',license:'CC0-1.0'}, {id:'unused',license:'MIT'}, {id:'stone',license:'Custom',notice:'Retain this notice'}];
  const credits = requiredCredits(gallery, entries);
  assert.deepEqual(credits.map(c=>c.id), ['fern','stone']);
  assert.equal(credits[0].changes, 'Converted to splats');
  assert.equal('path' in credits[0], false);
  assert.deepEqual(requiredCredits({rooms:[]}, entries), []);
});
test('unsafe credit links cannot execute code', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '/private', undefined]) assert.equal(safeCreditUrl(url), null);
  assert.equal(safeCreditUrl('https://creativecommons.org/licenses/by/4.0/'), 'https://creativecommons.org/licenses/by/4.0/');
});
