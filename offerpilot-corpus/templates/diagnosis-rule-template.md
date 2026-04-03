# Diagnosis Rule Template

Use this template to add new diagnosis rules to `diagnosis-rules.json`.

## Fields

- **rule_id**: Unique identifier (e.g., DR002, DR003)
- **issue_type**: Category of issue (e.g., resume, cover_letter, interview)
- **issue_name**: Specific name of the issue (e.g., weak_achievement, unclear_role)
- **definition**: Clear definition of the issue
- **trigger_signals**: Array of phrases or patterns that signal this issue
- **typical_bad_patterns**: Array of example texts showing the bad pattern
- **priority_level**: Priority (high, medium, low)
- **applicable_roles**: Array of roles this rule applies to
- **source_level**: Source credibility (expert, insider, curated)
- **notes**: Any additional context or sourcing information

## Example

```json
{
  "rule_id": "DR001",
  "issue_type": "resume",
  "issue_name": "weak_achievement",
  "definition": "Achievement statements are vague, lack metrics, or fail to demonstrate impact.",
  "trigger_signals": ["led", "responsible for", "helped with", "participated in"],
  "typical_bad_patterns": ["Responsible for managing social media accounts", "Helped with team projects", "Participated in marketing campaigns"],
  "priority_level": "high",
  "applicable_roles": ["product_manager", "marketing", "software_engineer"],
  "source_level": "expert",
  "notes": "This rule is based on analysis of 500+ resume reviews from top tech companies."
}
```