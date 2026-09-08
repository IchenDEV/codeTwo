import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal } from "../bridge";

import "./pull-requests.css";

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      onClick={(event) => {
        event.preventDefault();
        if (href != null && href !== "" && /^https?:\/\//iu.test(href))
          void openExternal(href);
      }}
    >
      {children}
    </a>
  ),
};

export function PullRequestBody({ body }: { body: string }) {
  return (
    <div className="pull-request-body text-foreground/90 min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
