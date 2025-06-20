const { graphql } = require("@octokit/graphql");
const { JSDOM } = require("jsdom");
const { fetch } = require('undici');

(async () => {
  // Action inputs
  const token = process.env.INPUT_GITHUB_TOKEN;
  const commentIdNumeric = parseInt(process.env.INPUT_COMMENT_ID_NUMERIC, 10);
  const originalBody = process.env.INPUT_COMMENT_BODY;
  const owner = process.env.INPUT_REPO_OWNER;
  const repo = process.env.INPUT_REPO_NAME;
  const discussionNumber = parseInt(process.env.INPUT_DISCUSSION_NUMBER, 10);

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  // Query to fetch comments and find global ID by numeric databaseId
  const queryComments = `
    query($owner: String!, $repo: String!, $discussionNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $discussionNumber) {
          comments(first: 100) {
            nodes {
              id
              databaseId
            }
          }
        }
      }
    }
  `;

  try {
    const resComments = await graphqlWithAuth(queryComments, { owner, repo, discussionNumber });
    const comments = resComments.repository.discussion.comments.nodes;
    const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

    // If comment not found, exit gracefully (0) to avoid false alarms
    if (!commentNode) {
      console.log('Comment not found with numeric ID:', commentIdNumeric);
      process.exit(0);
    }

    const commentNodeId = commentNode.id;

    // Query to check if comment is a reply (replyTo exists)
    const queryCheckReply = `
      query($owner: String!, $repo: String!, $discussionNumber: Int!, $commentId: ID!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $discussionNumber) {
            comment(id: $commentId) {
              id
              replyTo {
                id
              }
            }
          }
        }
      }
    `;

    const resReply = await graphqlWithAuth(queryCheckReply, { owner, repo, discussionNumber, commentId: commentNodeId });
    const replyTo = resReply.repository.discussion.comment.replyTo;
    const isReply = replyTo !== null && replyTo !== undefined;

    // If this comment is a reply, exit with 0 (no error)
    if (isReply) {
      console.log('Replies are not supported by this action. Exiting without error.');
      process.exit(0);
    }

    // Continue unfurl process for normal comments
    let previews = '';

    // Remove previous unfurl footer to update
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

    // Mutation to update the comment body with previews
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
