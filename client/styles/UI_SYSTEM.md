# FlowTrace UI System Documentation

This document describes the design tokens and utility system established for FlowTrace.

## Tokens Overview

All style tokens are defined as CSS variables in [tokens.css](file:///C:/Users/brije/Documents/flowtrace/client/styles/tokens.css).

### 1. Colors
- **Backgrounds**: `--color-bg-primary` (`#f8fafc`), `--color-bg-secondary` (`#ffffff`), `--color-bg-tertiary` (`#f1f5f9`).
- **Text Hierarchy**: `--color-text-primary` (`#0f172a`), `--color-text-secondary` (`#475569`), `--color-text-tertiary` (`#94a3b8`).
- **Borders**: `--color-border` (`#e2e8f0`), `--color-border-hover` (`#cbd5e1`).
- **Brand Colors**: `--color-brand` (`#4f46e5` - Primary Indigo), `--color-brand-hover` (`#4338ca`), `--color-brand-light` (`#e0e7ff`).

### 2. Status Badges
Status colors are carefully configured to ensure clean, high-contrast accessibility:
- **Success**: `--color-success` (`#15803d` - Forest Green), bg: `#f0fdf4`, border: `#bbf7d0`.
- **Warning/Skipped**: `--color-warning` (`#b45309` - Amber), bg: `#fffbeb`, border: `#fde68a`.
- **Error/Failed**: `--color-error` (`#b91c1c` - Strong Red), bg: `#fef2f2`, border: `#fca5a5`.
- **Running**: `--color-running` (`#0369a1` - Ocean Blue), bg: `#f0f9ff`, border: `#bae6fd`.

### 3. Typography
- **Font Family**: Standard sans-serif system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`)
- **Font Sizes**: `--font-size-xs` (12px), `--font-size-sm` (14px), `--font-size-base` (16px), `--font-size-lg` (18px), `--font-size-xl` (20px), `--font-size-xxl` (24px).
- **Font Weights**: `--font-weight-normal` (400), `--font-weight-medium` (500), `--font-weight-semibold` (600), `--font-weight-bold` (700).

### 4. Spacing
Consistent multiples of `4px`:
- `--spacing-1` (4px), `--spacing-2` (8px), `--spacing-3` (12px), `--spacing-4` (16px), `--spacing-5` (20px), `--spacing-6` (24px), `--spacing-8` (32px), `--spacing-12` (48px).

### 5. Utility Classes
- `.ft-card`: Hoverable, bordered content container with smooth transition.
- `.ft-btn` & `.ft-btn-primary`, `.ft-btn-secondary`: Custom button styles with padding and hover states.
- `.ft-badge` & `.ft-badge-success`, `.ft-badge-warning`, `.ft-badge-error`, `.ft-badge-running`: Fully rounded status badges.
