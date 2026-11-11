import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import HotelCard from './HotelCard.jsx';

function renderHotelCard(hotel) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><HotelCard hotel={hotel}/></MemoryRouter></QueryClientProvider>);
}

describe('hotel card availability', () => {
  it('clearly shows when the hotel accepts orders', () => {
    renderHotelCard({ id: 4, name: 'Cafe Harbor', cuisines: 'South Indian', address: 'Main Road', accepting_orders: true });

    expect(screen.getByText('Accepting orders')).toBeInTheDocument();
    expect(screen.queryByText('Popular nearby')).not.toBeInTheDocument();
  });

  it('clearly shows when the hotel is temporarily closed', () => {
    renderHotelCard({ id: 4, name: 'Cafe Harbor', accepting_orders: false });

    expect(screen.getByText('Temporarily closed')).toBeInTheDocument();
    expect(screen.getByText('Not accepting orders')).toBeInTheDocument();
  });
});
