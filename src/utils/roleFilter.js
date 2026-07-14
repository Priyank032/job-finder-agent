/**
 * Shared role/seniority filtering for BOTH the email agent (index.js) and the
 * Google-Sheet pipeline (src/apify/sheetPipeline.js). One source of truth so
 * the two jobs stay consistent.
 *
 * Priyank is a Software Developer (AI/LLM) - JS/TS + Python, LangChain/LLM,
 * RAG, multi-agent, AWS, Node/FastAPI, ~3 yrs. We want mid-level IC software /
 * AI-engineering roles and we explicitly do NOT want: ML/data-science/data-eng,
 * Java/.NET/PHP/Go/mobile/DevOps/QA/Big-Data/Salesforce/Oracle/SAP roles, or
 * intern/trainee/fresher and over-level (lead/principal/staff/...) postings.
 */

// Over-level IC titles (above mid-level). "Senior" is intentionally NOT here -
// in India it's often applied to 4-5yr roles; the years-of-experience parse
// handles the genuinely-senior ones.
const OVERLEVEL_TITLE = /\b(lead|principal|staff|architect|manager|director|vp|head\s+of|vice\s+president)\b/i;

// Wrong-discipline titles. Matched on the TITLE only - the title is the
// reliable "this is a different job family" signal; a good AI role's
// description may legitimately name-drop overlapping skills.
const OFFLANE_TITLE = new RegExp(
  [
    // ML / data
    'machine\\s*learning', '\\bml\\s*engineer\\b', '\\bmlops\\b', '\\bdeep\\s*learning\\b',
    '\\bdata\\s*scien(ce|tist)\\b', '\\bdata\\s*analyst\\b', '\\bdata\\s*analytics\\b',
    '\\bdata\\s*engineer\\b', '\\bbusiness\\s*analyst\\b', '\\banalytics\\b', '\\bbi\\s*developer\\b',
    // other language/platform stacks
    '\\bjava\\b', '\\b\\.net\\b', '\\bc#\\b', '\\bc\\+\\+\\b', '\\bgolang\\b', '\\bgo\\s*developer\\b',
    '\\bphp\\b', '\\bruby\\b', '\\bscala\\b', '\\brust\\b',
    '\\bandroid\\b', '\\bios\\b', '\\bflutter\\b', '\\bmobile\\s*developer\\b',
    // ops / infra / qa
    '\\bdevops\\b', '\\bsre\\b', '\\bsite\\s*reliability\\b', '\\bcloud\\s*engineer\\b',
    '\\bqa\\b', '\\bsdet\\b', '\\btest\\s*engineer\\b', '\\bautomation\\s*test',
    '\\bsupport\\s*engineer\\b', '\\bnetwork\\s*engineer\\b', '\\bembedded\\b', '\\bfirmware\\b',
    // big-data / enterprise platforms
    '\\bhadoop\\b', '\\bspark\\b', '\\betl\\b', '\\bbig\\s*data\\b', '\\bkafka\\s*developer\\b',
    '\\bsalesforce\\b', '\\boracle\\b', '\\bsap\\b', '\\bsharepoint\\b',
    // level too junior
    '\\bintern(ship)?\\b', '\\btrainee\\b', '\\bfresher\\b',
  ].join('|'),
  'i'
);

/** True if the title is above mid-level IC (lead/principal/etc.). */
function isOverLevelTitle(title) {
  return OVERLEVEL_TITLE.test(title || '');
}

/** True if the title is a different discipline/stack than Priyank's. */
function isOffLaneTitle(title) {
  return OFFLANE_TITLE.test(title || '');
}

/**
 * True if the title should be dropped before deeper processing (either
 * over-level or off-lane). Cheap, deterministic, no AI cost.
 */
function isTitleRejected(title) {
  return isOverLevelTitle(title) || isOffLaneTitle(title);
}

module.exports = {
  OVERLEVEL_TITLE,
  OFFLANE_TITLE,
  isOverLevelTitle,
  isOffLaneTitle,
  isTitleRejected,
};
