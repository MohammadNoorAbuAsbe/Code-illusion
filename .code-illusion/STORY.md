check_coverage_command -> analyzes editor -> creates diagnostics for missing annotations
  ├─ get_active_editor -> gets editor or throws
  └─ analyze_editor -> reads document -> forwards narrativeDepth setting
     └─ analyze_document -> parses/extracts single file -> builds call graph -> returns cards + story
init_rules_command -> copies agent rule templates to workspace root
install_precommit_hook -> writes pre-commit hook to .git/hooks/pre-commit -> makes executable
open_project_story_command -> resolves workspace target -> analyzes project -> shows story webview
  ├─ analyze_project -> analyzes every file -> builds one unified cross-file call graph
  │  ├─ resolve_inputs -> expands files/dirs/globs -> supported file paths
  │  ├─ compose_narratives -> renders a narrative tree for every labelled card
  │  ├─ build_execution_flow -> joins entry-point narratives into a file-level story
  │  └─ aggregate_coverage -> sums annotated/total across files -> lists missing blocks  └─ show_project_story -> creates/updates panel -> renders unified story + coverage
     └─ content -> builds HTML with coverage header + execution-flow tree
open_view_command -> analyzes active editor -> shows de-cluttered panel
  ├─ get_active_editor -> gets editor or throws
  ├─ analyze_editor -> reads document -> forwards narrativeDepth setting
  │  └─ analyze_document -> parses/extracts single file -> builds call graph -> returns cards + story  └─ show_decluttered_view -> creates panel -> wires message handlers -> posts update
     ├─ webview_content -> builds HTML template with CSP nonce and asset URIs
     ├─ apply_decorations -> paints ann/miss markers on the active editor
     ├─ highlight_id -> looks up highlight id -> falls back to plaintext
     └─ post_note -> sends an info status to the webview when analysis notes something
scaffold_command -> analyzes editor -> filters missing -> inserts placeholders bottom-up
  ├─ get_active_editor -> gets editor or throws
  ├─ analyze_editor -> reads document -> forwards narrativeDepth setting
  │  └─ analyze_document -> parses/extracts single file -> builds call graph -> returns cards + story  └─ scaffold_proposals -> finds unannotated blocks -> returns indented placeholder insertions
build_card_from_block -> reads block -> derives id/label/code -> returns Card
  ├─ preceding_comments -> climbs parents -> collects @illusion comments directly above node
  └─ extract_label -> scans comments -> returns the @illusion summary text
is_call_scope_boundary -> true for nested functions/blocks that end a caller's direct-call scope
  └─ is_block -> true if node is an extractable function/class/loop/try block
     └─ is_function_value -> checks if a variable_declarator's value is a function
get_block_name -> reads the node's name field -> returns block identifier
add_name -> deduplicates -> appends new call name
resolve_module_file -> appends extension/index candidates -> returns existing path
build_artifacts -> computes all supplementary analysis -> renders markdown + JSON artifacts
  ├─ compute_entry_point_summary -> returns annotated/total entry point counts
  ├─ compute_god_nodes -> counts in-degree per card from call edges -> sorted desc
  ├─ compute_surprising_connections -> finds edges where caller and callee are in different files
  ├─ compute_directory_coverage -> groups cards by directory -> computes per-dir stats
  ├─ compute_priority_gaps -> finds unannotated cards that are called by other blocks
  ├─ format_coverage_markdown -> renders the human-readable COVERAGE.md
  └─ format_coverage_json -> builds the machine-readable CoverageJson structure
write_artifacts -> writes artifact files to the output directory -> returns written paths
  └─ ensure_out_dir -> creates directory if it doesn't exist -> returns path
     └─ get_default_out_dir -> returns default output directory path
write_gitignore -> writes or appends .code-illusion/cache to .gitignore
  └─ get_default_out_dir -> returns default output directory path
mk_line_comment -> returns line comment config from token
clear_decorations -> removes markers from the editor
reanalyze_and_decorate -> re-runs analysis -> repaints editor markers
  ├─ editor_for_uri -> finds open editor matching the tracked uri
  ├─ analyze_document -> parses/extracts single file -> builds call graph -> returns cards + story
  │  ├─ analyze_file_core -> parses/extracts a single file -> returns cards + block structure
  │  ├─ resolve_external_labels -> resolves imported names -> their @illusion labels (one level)
  │  ├─ get_language_config -> looks up language -> returns config or null
  │  ├─ build_call_graph -> maps calls to card edges -> computes entry points + external leaves
  │  ├─ compose_narratives -> renders a narrative tree for every labelled card
  │  └─ build_execution_flow -> joins entry-point narratives into a file-level story  └─ apply_decorations -> paints ann/miss markers on the active editor
     ├─ ensure_decoration_types -> creates ann + miss decoration types once
     └─ cards_to_ranges -> maps cards to ann/miss whole-line ranges
reveal_in_editor -> opens document -> scrolls to range -> sets selection
is_panel_open -> returns true if panel exists
toggle_story -> flips story collapsed state -> toggles chevron
start_editing -> marks a card as editing -> re-renders with input focused
  └─ render -> rebuilds filter UI + grouped/animated card list from state
     ├─ get_visible_cards -> applies status/kind/text filters + sort -> returns cards
     ├─ query_el -> grabs element by id -> returns typed HTMLElement
     ├─ icon -> looks up svg path -> wraps named icon in svg markup
     ├─ escape_html -> escapes text -> prevents html injection
     └─ get_grouped_cards -> groups cards by kind -> returns ordered map
finish_editing -> commits label -> posts editAnnotation to extension
  └─ render -> rebuilds filter UI + grouped/animated card list from state
     ├─ get_visible_cards -> applies status/kind/text filters + sort -> returns cards
     ├─ query_el -> grabs element by id -> returns typed HTMLElement
     ├─ icon -> looks up svg path -> wraps named icon in svg markup
     ├─ escape_html -> escapes text -> prevents html injection
     └─ get_grouped_cards -> groups cards by kind -> returns ordered map
cancel_editing -> clears editing state -> re-renders
  └─ render -> rebuilds filter UI + grouped/animated card list from state
     ├─ get_visible_cards -> applies status/kind/text filters + sort -> returns cards
     ├─ query_el -> grabs element by id -> returns typed HTMLElement
     ├─ icon -> looks up svg path -> wraps named icon in svg markup
     ├─ escape_html -> escapes text -> prevents html injection
     └─ get_grouped_cards -> groups cards by kind -> returns ordered map
collapse_all_cards -> clears expanded set -> hides all code
expand_all_cards -> marks all expanded -> shows all code
