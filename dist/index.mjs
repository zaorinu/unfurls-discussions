/******/ var __webpack_modules__ = ({

/***/ 509:
/***/ ((module) => {

module.exports = eval("require")("@octokit/graphql");


/***/ }),

/***/ 135:
/***/ ((module) => {

module.exports = eval("require")("jsdom");


/***/ }),

/***/ 663:
/***/ ((module) => {

module.exports = eval("require")("node-fetch");


/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};
/* harmony import */ var _octokit_graphql__WEBPACK_IMPORTED_MODULE_0__ = __nccwpck_require__(509);
/* harmony import */ var jsdom__WEBPACK_IMPORTED_MODULE_1__ = __nccwpck_require__(135);
/* harmony import */ var node_fetch__WEBPACK_IMPORTED_MODULE_2__ = __nccwpck_require__(663);




(async () => {
  const token = process.env.GH_TOKEN;
  const commentIdNumeric = parseInt(process.env.COMMENT_ID_NUMERIC);
  const originalBody = process.env.COMMENT_BODY;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const discussionNumber = parseInt(process.env.DISCUSSION_NUMBER);

  const graphqlWithAuth = _octokit_graphql__WEBPACK_IMPORTED_MODULE_0__.graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  // Query to fetch comments from the discussion
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

  const res = await graphqlWithAuth(query, { owner, repo, discussionNumber });
  const comments = res.repository.discussion.comments.nodes;
  const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

  if (!commentNode) {
    console.error('Comment not found with numeric ID:', commentIdNumeric);
    process.exit(1);
  }

  const commentNodeId = commentNode.id;
  let previews = '';

  // Remove existing footer block if present, to avoid duplication
  const bodyWithoutFooter = originalBody.replace(/<!-- unfurl-bot-start -->[\s\S]*?<!-- unfurl-bot-end -->/g, '').trim();

  // Extract URLs from the comment body (outside of footer block)
  const urls = [...bodyWithoutFooter.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);

  for (const url of urls) {
    try {
      const response = await node_fetch__WEBPACK_IMPORTED_MODULE_2__(url);
      const text = await response.text();
      const dom = new jsdom__WEBPACK_IMPORTED_MODULE_1__.JSDOM(text);
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

  // GraphQL mutation to update the discussion comment with previews
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
})().catch(err => {
  console.error('An unexpected error occurred:', err);
  process.exit(1);
});

