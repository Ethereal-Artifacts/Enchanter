# Localization

Enchanter localizes its controls and information panel from `apps/standalone/src/locales/en.json` and `apps/standalone/src/locales/translations.json`. English is the fallback and contains the canonical `controls`, `information`, and `legal` fields. Each translated entry contains `controls` and `information`; legal copy and license terms stay in English.

There are 72 translated language tags plus English, for 73 authored language tags. The translated tags are:

| | | | |
| --- | --- | --- | --- |
| `ga` | `ja` | `it` | `fa` |
| `am` | `kn` | `om` | `bn` |
| `zh-Hans` | `cs` | `et` | `fi` |
| `pa` | `uz` | `zu` | `km` |
| `ko` | `ht` | `hy` | `mk` |
| `lt` | `pt` | `sk` | `th` |
| `fr` | `mn-Mong` | `es` | `sw` |
| `gu` | `yo` | `uk` | `bg` |
| `yue-Hant` | `da` | `tl` | `el` |
| `mr` | `az` | `ms` | `hu` |
| `kk` | `sr` | `ka` | `is` |
| `nb` | `ro` | `sl` | `tr` |
| `de` | `mn-Cyrl` | `ar` | `ha` |
| `ps` | `ml` | `ur` | `zh-Hant` |
| `hr` | `nl` | `ta` | `hi` |
| `te` | `ne` | `af` | `id` |
| `si` | `sq` | `bs` | `lv` |
| `pl` | `ru` | `sv` | `vi` |

Four regional input tags reuse an authored language: `en-GB` → English, `de-CH` → German, `pt-BR` → Portuguese, and `es-419` → Spanish. These aliases bring the exact supported input set to 77 tags, counting English and translations. For other unrecognized regional tags, the runtime tries the base language if that exact translation key exists, then falls back to English.

The runtime sets right-to-left direction for Arabic (`ar`), Persian (`fa`), Urdu (`ur`), and Pashto (`ps`), including regional variants that resolve to those base languages. Other resolved languages use left-to-right direction. Echo names such as “Palace of Fine Arts” are not translated.

The standalone page begins with its document language (`<html lang="…">`). An embedding host can set that language before boot or change it during a session; Enchanter observes document-language changes and refreshes the interface.

When changing copy fields, update the English source first and keep translated `controls` and `information` structures aligned. Translation coverage does not certify translation quality; have a fluent reader review copy before relying on it for publication.
