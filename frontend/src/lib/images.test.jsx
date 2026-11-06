import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeImage } from './images.jsx';

describe('SafeImage', () => {
  it('shows a branded, accessible hotel placeholder when no image is configured', () => {
    render(<SafeImage alt="Harbor Hotel cover" width={640} height={360}/>);
    expect(screen.getByRole('img', { name: 'Harbor Hotel cover' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Image unavailable' })).not.toBeInTheDocument();
  });

  it('falls back to the same local placeholder when an optional remote image fails', () => {
    render(<SafeImage src="https://images.example.test/failed.jpg" alt="Harbor Hotel cover" width={640} height={360}/>);
    fireEvent.error(screen.getByRole('img', { name: 'Harbor Hotel cover' }));
    expect(screen.getByRole('img', { name: 'Harbor Hotel cover' }).tagName).toBe('DIV');
  });
});
