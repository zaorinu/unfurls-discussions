# Unfurl Discussion Comment

> Add link previews automatically in GitHub Discussions comments.

---

## English

### Description
This GitHub Action fetches and adds link previews below the original comment in a GitHub Discussion. It extracts titles from URLs and appends them as markdown blockquotes inside a special footer block.

### Inputs

| Input              | Description                        | Required |
|--------------------|----------------------------------|----------|
| `github_token`      | GitHub token for API access       | Yes      |
| `comment_id_numeric`| Numeric ID of the comment          | Yes      |
| `comment_body`      | Original comment body text         | Yes      |
| `repo_owner`        | Repository owner (e.g. `octocat`) | Yes      |
| `repo_name`         | Repository name (e.g. `hello-world`)| Yes    |
| `discussion_number` | Number of the discussion           | Yes      |

### Outputs

| Output             | Description                  |
|--------------------|------------------------------|
| `updated_comment_id`| ID of the updated comment    |

### Usage Example

```yaml
jobs:
  unfurl_comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Unfurl GitHub Discussion Comment
        uses: zaorinu/unfurl-discussion-comment@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          comment_id_numeric: ${{ github.event.comment.id }}
          comment_body: ${{ github.event.comment.body }}
          repo_owner: ${{ github.repository_owner }}
          repo_name: ${{ github.event.repository.name }}
          discussion_number: ${{ github.event.discussion.number }}
