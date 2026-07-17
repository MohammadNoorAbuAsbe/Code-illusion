# Code Illusion — Agent Annotation Standard

This project uses the **Code Illusion De-tangler** VS Code extension. It renders code as a
side-by-side "De-cluttered View": the original code on the left, and collapsed **semantic
micro-cards** on the right. The cards are produced by **you (the agent)**, not by a heuristic.

Every logical block you touch must be described by an inline `@illusion` annotation that you write.
The extension only renders what you author — it never invents card text.

## The rule (mandatory)

For **every** function, method, class, `try` block, and significant loop you add or edit, place an
inline comment immediately above it in this exact form:

```
@illusion: <human-readable summary of what this block does>
```

- The summary must describe **intent**, using plain human verbs and data flow, e.g.
  `fetch profile -> transform -> save to LocalStorage`. Prefer `A -> B -> C` flow notation.
- Keep it short (one line). This is the "optical filter" that lets humans skip the boilerplate.
- The comment must sit **directly above** the block it describes, with only blank lines between.

### Language-specific comment styles

```js
// @preserve @illusion: fetchUserProfile -> Fetches profile -> Saves to LocalStorage
async function fetchUserProfile(id) { /* ... */ }
```

```python
# @illusion: load_config -> reads env -> returns typed settings
def load_config(): ...
```

```java
// @preserve @illusion: authenticate -> validates token -> returns principal
public Principal authenticate(String token) { ... }
```

```csharp
// @preserve @illusion: hydrate_order -> queries db -> maps to DTO
public OrderDto HydrateOrder(int id) { ... }
```

```go
// @preserve @illusion: sync_ledger -> pulls remote -> writes local cache
func syncLedger() error { ... }
```

```rust
// @preserve @illusion: parse_args -> validates cli -> builds Config
fn parse_args() -> Config { ... }
```

```html
<!-- @illusion: user_card -> renders avatar + name -->
<div class="user-card"> ... </div>
```

## When you MUST annotate

1. **Adding code** — annotate every new block before finishing the task.
2. **Editing code** — if you change a block's behavior, update its `@illusion` text to match.
3. **Touching existing code** — if you open/modify a file and find a block with **no**
   `@illusion` comment, you MUST add one. Run the `Code Illusion: Scaffold Annotations` command
   (or the `Check Coverage` command) to find gaps, then fill in the real wording. Never leave a
   `@illusion: <TODO ...>` placeholder in committed code.
4. **Never delete** an `@illusion` annotation unless you are also deleting the block it describes.

## How the tool helps you (and CI)

- `Code Illusion: Open De-cluttered View` — side-by-side cards; missing annotations show a
  `⚠ missing @illusion` badge.
- `Code Illusion: Check Coverage` — lists every unannotated block in the Problems panel. Use it to
  verify 100% coverage before considering a task done.
- `Code Illusion: Scaffold Annotations` — inserts `@illusion: <TODO ...>` placeholders above gaps so
  you can fill them in. (Placeholders are a starting point, not a final answer.)
- `Code Illusion: Init Agent Rules` — copies this standard into a project (`AGENTS.md`, etc.).

## Examples of good cards

```
// @preserve @illusion: debounce -> throttles calls -> returns wrapped fn
// @preserve @illusion: retry_with_backoff -> attempts N times -> exponential delay
// @preserve @illusion: validate_request -> checks schema -> throws on mismatch
// @preserve @illusion: cache_lookup -> checks memory -> falls back to redis
```

Bad (do not do this — it just restates the code):

```
// @preserve @illusion: function that does a loop and sets a variable
```

Good:

```
// @preserve @illusion: aggregate_metrics -> groups by day -> computes rolling average
```
