import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import userEvent from '@testing-library/user-event';

const valueFor = (input) => {
  if (input.type === 'email') return 'asha.rao9@example.test';
  if (input.type === 'tel' || input.inputMode === 'numeric') return '9876543210';
  return 'Asha Rao 9';
};

export async function expectStableTypingFocus(renderForm, fieldLabels) {
  const result = await renderForm();
  const user = result?.user || userEvent.setup();
  for (const label of fieldLabels) {
    const scope = screen.queryByRole('dialog') || document.body;
    const input = within(scope).getByLabelText(label);
    const value = valueFor(input);
    await user.clear(input);
    await user.type(input, value);
    expect(within(screen.queryByRole('dialog') || document.body).getByLabelText(label)).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue(value);
  }
  return result;
}
