import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataView } from './data-view';

describe('<DataView>', () => {
  it('renders the loading branch', () => {
    render(<DataView status="loading">child</DataView>);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('child')).not.toBeInTheDocument();
  });

  it('renders the empty branch with default message', () => {
    render(<DataView status="empty">child</DataView>);
    expect(screen.getByText('No data available.')).toBeInTheDocument();
  });

  it('renders the empty branch with custom message', () => {
    render(
      <DataView status="empty" emptyMessage="No spaces available yet.">
        child
      </DataView>,
    );
    expect(screen.getByText('No spaces available yet.')).toBeInTheDocument();
  });

  it('renders the error branch with default message', () => {
    render(<DataView status="error">child</DataView>);
    expect(
      screen.getByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
  });

  it('renders the loaded branch (children)', () => {
    render(<DataView status="loaded">my-content</DataView>);
    expect(screen.getByText('my-content')).toBeInTheDocument();
  });
});
