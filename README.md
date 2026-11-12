# Breast Pump Insurance Benefit

BenefitChecker front end for the BabyBrands breast pump insurance guide.

**Shortcode:** `[bbib_insurance_guide]`  
**Requires:** Breast Pump Insurance Guide (same database, REST API, and admin).  
**Version:** 1.0.0 (`BBIB_VERSION`)

## Install

1. Activate **Breast Pump Insurance Guide**.
2. Activate **Breast Pump Insurance Benefit**.
3. Add `[bbib_insurance_guide]` to a page.

Optional attribute: `return_url` (falls back to the guide Settings return URL, then the site home).

URL parameters `source` and `campaign` use the same allowlists as the guide plugin.

## Screens

1. **Your insurer** — company select and email  
2. **Find your coverage** — shopping plans, places to check, insurer website, then the amount card  
3. **Summary** — reported insurer and amount

Answers are stored in the guide plugin tables and appear under **Breast Pump Guide** in wp-admin.

## Architecture

| Piece | Owner |
| --- | --- |
| Shortcode, CSS, JS, logo | This plugin |
| Tables, REST `/wp-json/bbgc/v1`, admin, insurer directory | Breast Pump Insurance Guide |

This plugin does not create tables or admin screens. Deactivating it does not delete guide data.

Design reference HTML lives in `ref/` and is not loaded by WordPress.
