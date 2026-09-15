# Paideia Tech Logo Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce official, production-ready SVG and transparent PNG variants of the approved Paideia Tech portal logo in the project asset directory.

**Architecture:** Use hand-authored SVG as the canonical mark so every geometric relationship remains crisp and editable. Export lossless transparent PNG copies from the SVG at header and application-icon sizes, then verify XML validity, raster dimensions, alpha channel, and navy-background legibility.

**Tech Stack:** SVG 1.1, ImageMagick `rsvg-convert` or `magick` for PNG rendering, shell validation commands.

## Global Constraints

- Use the selected abstract “Portal of Knowledge” mark: two symmetric cyan architectural planes and one restrained gold horizontal certification stroke.
- Use `#050A1A` only for preview/contrast checks; all production asset backgrounds are transparent.
- Use cyan `#0088FF`, gold `#FFD700`, white `#FFFFFF`, and supporting gray `#D0D0D0` only.
- Use no gradients, shadows, literal therapy/medical/spa motifs, generic checkmark, or script typography.
- Final assets live in `assets/images/logo/` and do not overwrite unrelated existing assets.

---

### Task 1: Create canonical SVG variants

**Files:**
- Create: `assets/images/logo/paideia-tech-logo-dark.svg`
- Create: `assets/images/logo/paideia-tech-symbol.svg`
- Create: `assets/images/logo/paideia-tech-logo-white.svg`

**Interfaces:**
- Consumes: approved design spec at `docs/superpowers/specs/2026-08-08-paideia-tech-logo-design.md`.
- Produces: scalable horizontal lockup, isolated square symbol, and one-color white lockup.

- [ ] **Step 1: Create the header lockup SVG**

Use a `viewBox="0 0 560 112"`, an icon group on a 90x90 grid, `fill="none"` cyan strokes with `stroke-width="8"`, and text expressed as an accessible `aria-label="Paideia Tech"` wordmark. Place a gold `stroke="#FFD700"` horizontal line inside the portal lower opening.

- [ ] **Step 2: Create the isolated symbol SVG**

Use a square `viewBox="0 0 96 96"`, preserve the same portal stroke geometry as the lockup, and set no root `fill` background.

- [ ] **Step 3: Create the one-color SVG**

Reuse the horizontal lockup geometry with every mark and wordmark detail set to `#FFFFFF`; remove the gold distinction only for this constrained one-color variant.

- [ ] **Step 4: Validate SVG source**

Run: `xmllint --noout assets/images/logo/paideia-tech-logo-dark.svg assets/images/logo/paideia-tech-symbol.svg assets/images/logo/paideia-tech-logo-white.svg`

Expected: exit status 0 and no parser output.

- [ ] **Step 5: Commit**

Run: `git add assets/images/logo/*.svg && git commit -m "feat: add Paideia Tech SVG logo system"`

### Task 2: Export and verify transparent PNG deliverables

**Files:**
- Create: `assets/images/logo/paideia-tech-logo-dark.png`
- Create: `assets/images/logo/paideia-tech-symbol-512.png`
- Create: `assets/images/logo/paideia-tech-favicon-32.png`

**Interfaces:**
- Consumes: the three Task 1 SVGs.
- Produces: transparent raster assets for a website header, app icon, and favicon source.

- [ ] **Step 1: Render the header lockup PNG**

Run: `rsvg-convert -w 1680 -h 336 assets/images/logo/paideia-tech-logo-dark.svg -o assets/images/logo/paideia-tech-logo-dark.png`

Expected: a 1680x336 transparent PNG preserving the `5:1` horizontal lockup ratio.

- [ ] **Step 2: Render symbol PNGs**

Run: `rsvg-convert -w 512 -h 512 assets/images/logo/paideia-tech-symbol.svg -o assets/images/logo/paideia-tech-symbol-512.png && rsvg-convert -w 32 -h 32 assets/images/logo/paideia-tech-symbol.svg -o assets/images/logo/paideia-tech-favicon-32.png`

Expected: two square transparent PNGs at exactly 512px and 32px.

- [ ] **Step 3: Validate alpha and dimensions**

Run: `identify -format '%f %wx%h %[channels]\n' assets/images/logo/paideia-tech-logo-dark.png assets/images/logo/paideia-tech-symbol-512.png assets/images/logo/paideia-tech-favicon-32.png`

Expected: `1680x336`, `512x512`, and `32x32`; each output contains an alpha channel (`srgba` or equivalent).

- [ ] **Step 4: Render a navy contrast preview**

Run: `magick -size 1900x700 xc:'#050A1A' assets/images/logo/paideia-tech-logo-dark.png -gravity center -composite /tmp/paideia-tech-logo-preview.png`

Expected: cyan/white wordmark and gold bar are clearly readable without clipping or fringe.

- [ ] **Step 5: Commit**

Run: `git add assets/images/logo/*.png && git commit -m "feat: export Paideia Tech PNG logo assets"`
