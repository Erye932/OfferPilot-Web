# Insider View Template

Use this template to add new insider views to `insider-views.json`.

## Fields

- **view_id**: Unique identifier (e.g., IV002, IV003)
- **issue_type**: Category of issue (e.g., resume, cover_letter, interview)
- **role_context**: The insider's role/context (e.g., tech_recruiter_at_faang, hiring_manager_startup)
- **view_text**: The actual insider perspective text
- **tone**: Tone of the view (e.g., direct, pragmatic, critical, encouraging)
- **applicable_roles**: Array of roles this view applies to
- **source_level**: Source credibility (insider, expert, curated)
- **notes**: Any additional context or sourcing information

## Example

```json
{
  "view_id": "IV001",
  "issue_type": "resume",
  "role_context": "tech_recruiter_at_faang",
  "view_text": "When I see a resume with vague achievements like 'responsible for X', I immediately assume the candidate didn't have real impact. We look for specific metrics that show how you moved the needle.",
  "tone": "direct",
  "applicable_roles": ["software_engineer", "data_scientist", "product_manager"],
  "source_level": "insider",
  "notes": "Based on interview with a FAANG recruiter with 8 years of experience."
}
```