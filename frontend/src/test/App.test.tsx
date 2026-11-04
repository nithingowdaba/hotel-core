import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../App'

describe('App', () => {
  it('renders the home page', () => {
    render(<App />)
    expect(screen.getByText('Hotel Core')).toBeInTheDocument()
  })
})
