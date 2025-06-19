const { graphql } = require("@octokit/graphql");
const { JSDOM } = require("jsdom");
const fetch = require("node-fetch");

(async () => {
  // Read environment variables passed by the GitHub Action inputs
  const token = process.env.GITHUB_TOKEN; // GitHub API token
  const commentIdNumeric = parseInt(process.env.COMMENT_ID_NUMERIC, 10); // Numeric ID of the comment to update
  const originalBody = process.env.COMMENT_BODY; // Original content of the comment
  const owner = process.env.REPO_OWNER; // Repository owner
  const repo = process.env.REPO_NAME; // Repository name
  const discussionNumber = parseInt(process.env.DISCUSSION_NUMBER, 10); // Discussion number

  // Create a GraphQL client instance with the authentication token
  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  // GraphQL query to fetch the first 100 comments from the discussion
  const query = `
    query($owner: String!, $repo: String!, $discussionNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $discussionNumber) {
          comments(first: 100) {
            nodes {
              id
              databaseId
              body
            }
          }
        }
      }
    }
  `;

  try {
    // Execute the query with the given variables
    const res = await graphqlWithAuth(query, { owner, repo, discussionNumber });

    // Extract the comments array from the response
    const comments = res.repository.discussion.comments.nodes;

    // Find the specific comment node by its numeric database ID
    const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

    if (!commentNode) {
      // Exit if the comment is not found
      console.error('Comment not found with numeric ID:', commentIdNumeric);
      process.exit(1);
    }

    const commentNodeId = commentNode.id;
    let previews = '';

    // Remove existing preview footer block to avoid duplicates
    const bodyWithoutFooter = originalBody.replace(/<!-- unfurl-bot-start -->[\s\S]*?<!-- unfurl-bot-end -->/g, '').trim();

    // Extract all URLs from the comment body excluding the footer block
    const urls = [...bodyWithoutFooter.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);

    // For each URL, fetch the page and extract the title or Open Graph title
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const text = await response.text();
        const dom = new JSDOM(text);

        // Try to get og:title meta tag content, fallback to document title or the URL itself
        const metaOgTitle = dom.window.document.querySelector('meta[property="og:title"]');
        const title = (metaOgTitle && metaOgTitle.getAttribute('content')) || dom.window.document.title || url;

        // Build the preview snippet with markdown blockquote style
        previews += `> **${title}**\n> ${url}\n\n`;
      } catch (err) {
        // Log errors if fetching or parsing the URL fails, but continue processing others
        console.error(`Error fetching ${url}:`, err);
      }
    }

    // Start building the new comment body with the original content (without old footer)
    let newBody = bodyWithoutFooter;

    // Append the previews block if any previews were generated
    if (previews.trim() !== '') {
      newBody += `\n\n<!-- unfurl-bot-start -->\n${previews}<!-- unfurl-bot-end -->`;
    }

    // GraphQL mutation to update the comment body with the new content
    const mutation = `
      mutation($commentId: ID!, $body: String!) {
        updateDiscussionComment(input: {commentId: $commentId, body: $body}) {
          comment {
            id
            body
          }
        }
      }
    `;

    // Execute the mutation to update the comment
    const updateRes = await graphqlWithAuth(mutation, { commentId: commentNodeId, body: newBody });

    // Log success message with updated comment ID
    console.log('Comment successfully updated:', updateRes.updateDiscussionComment.comment.id);
  } catch (err) {
    // Handle unexpected errors gracefully
    console.error('An unexpected error occurred:', err);
    process.exit(1);
  }
})();
