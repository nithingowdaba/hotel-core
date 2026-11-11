import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderPlaced from './OrderPlaced.jsx';

describe('order confirmation page', () => {
  it('lets the customer return home after placing an order', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/order-placed', state: { order: {
        id: 42,
        total_amount: 250,
        payment_method: 'upi',
        created_at: '2026-11-06T08:00:00.000Z',
      }, hotelName: 'Cafe Harbor' } }]}>
        <Routes>
          <Route path="/order-placed" element={<OrderPlaced/>}/>
          <Route path="/" element={<h1>Home page</h1>}/>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'That’s a good choice.' })).toBeInTheDocument();
    expect(screen.getByText('Payment method: UPI')).toBeInTheDocument();
    expect(screen.getByText(/Order time:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /back to home/i }));

    expect(screen.getByRole('heading', { name: 'Home page' })).toBeInTheDocument();
  });
});
