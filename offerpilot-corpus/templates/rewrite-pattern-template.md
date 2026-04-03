# Rewrite Pattern Template

Use this template to add new rewrite patterns to `rewrite-patterns.json`.

## Fields

- **pattern_id**: Unique identifier (e.g., RP002, RP003)
- **issue_type**: Category of issue (e.g., resume, cover_letter, interview)
- **role_type**: Target role type (e.g., software_engineer, product_manager, marketing)
- **before_text**: Original text that needs improvement
- **after_text**: Improved version after rewriting
- **rewrite_logic**: Explanation of the rewriting strategy
- **key_transformation**: Summary of key changes made
- **source_level**: Source credibility (expert, insider, curated)
- **difficulty_level**: Implementation difficulty (easy, medium, hard)

## Example

```json
{
  "pattern_id": "RP001",
  "issue_type": "resume",
  "role_type": "software_engineer",
  "before_text": "Responsible for developing new features for the mobile app.",
  "after_text": "Developed 3 major features for the mobile app, improving user retention by 15% and reducing crash rate by 40%.",
  "rewrite_logic": "Transformed passive responsibility into active achievement with quantifiable metrics.",
  "key_transformation": "Responsible for → Developed; added metrics for retention and crash rate",
  "source_level": "expert",
  "difficulty_level": "medium"
}
```