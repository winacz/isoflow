jest.mock('src/utils/nodeHighlightScale', () => ({
  getNodeHighlightScale: () => 1,
  SCALE_REF_AREA: 171
}));

import { createEditorInitialData } from '../createEditorInitialData';
import { modelSchema } from 'src/schemas/model';

test('validate karczma initial data', () => {
  const data = createEditorInitialData();
  const result = modelSchema.safeParse(data);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result.error.errors.slice(0, 40), null, 2));
    // eslint-disable-next-line no-console
    console.log('total issues', result.error.errors.length);
  }
  expect(result.success).toBe(true);
  expect(data.vlanNames).toEqual({
    '10': 'Users',
    '20': 'Voice',
    '30': 'Servers',
    '40': 'IoT'
  });
});
