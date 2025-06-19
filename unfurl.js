const { graphql } = require("@octokit/graphql");
const { JSDOM } = require("jsdom");
const { fetch } = require('undici');

(async () => {
  // Lendo os inputs passados pela Action
  const token = process.env.INPUT_GITHUB_TOKEN;
  const commentIdNumeric = parseInt(process.env.INPUT_COMMENT_ID_NUMERIC, 10);
  const originalBody = process.env.INPUT_COMMENT_BODY;
  const owner = process.env.INPUT_REPO_OWNER;
  const repo = process.env.INPUT_REPO_NAME;
  const discussionNumber = parseInt(process.env.INPUT_DISCUSSION_NUMBER, 10);

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

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
    const res = await graphqlWithAuth(query, { owner, repo, discussionNumber });
    const comments = res.repository.discussion.comments.nodes;
    const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

    if (!commentNode) {
      console.error('Comment not found with numeric ID:', commentIdNumeric);
      process.exit(1);
    }

    const commentNodeId = commentNode.id;
    let previews = '';

    const bodyWithoutFooter = originalBody.replace(/<!-- unfurl-bot-start -->[\s\S]*?<!-- unfurl-bot-end -->/g, '').trim();
    const urls = [...bodyWithoutFooter.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);

    for (const url of urls) {
      try {
        const response = await fetch(url);
        const text = await response.text();
        const dom = new JSDOM(text);
        const metaOgTitle = dom.window.document.querySelector('meta[property="og:title"]');
        const title = (metaOgTitle && metaOgTitle.getAttribute('content')) || dom.window.document.title || url;
        previews += `> **${title}**\n> ${url}\n\n`;
      } catch (err) {
        console.error(`Error fetching ${url}:`, err);
      }
    }

    let newBody = bodyWithoutFooter;

    if (previews.trim() !== '') {
      newBody += `\n\n<!-- unfurl-bot-start -->\n${previews}<!-- unfurl-bot-end -->`;
    }

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

    const updateRes = await graphqlWithAuth(mutation, { commentId: commentNodeId, body: newBody });
    console.log('Comment successfully updated:', updateRes.updateDiscussionComment.comment.id);
  } catch (err) {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
  }
})();
