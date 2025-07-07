import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PostRecord } from "./schema.js";

function parseCSV(csvText: string): PostRecord[] {
	const lines = csvText.split('\n');
	const headers = lines[0].split(',');
	
	return lines.slice(1)
		.filter((line: string) => line.trim())
		.map((line: string) => {
			const values = line.split(',');
			const post: any = {};
			headers.forEach((header: string, index: number) => {
				post[header] = values[index] || '';
			});
			return post as PostRecord;
		});
}
// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Andrew MCP",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"search_youtube_podcast",
			{
				keywords: z.string().describe("Keywords to search for in YouTube transcriptions"),
				limit: z.number().min(1).max(500).optional().default(50).describe("Maximum number of results to return")
			},
			async ({ keywords, limit = 50 }) => {
				console.log("Searching YouTube transcriptions with keywords:", keywords, "Limit:", limit);
				return {
					content: [{ type: "text", text: `Searched YouTube transcriptions for: ${keywords} (Limit: ${limit})` }]
				};
			}
		);

		this.server.tool(
			"get_youtube_podcast",
			{
				keywords: z.string().describe("Keywords to search for in YouTube transcriptions"),
				limit: z.number().min(1).max(500).optional().default(50).describe("Maximum number of results to return")
			},
			async ({ keywords, limit = 50 }) => {
				console.log("Searching YouTube transcriptions with keywords:", keywords, "Limit:", limit);
				return {
					content: [{ type: "text", text: `Searched YouTube transcriptions for: ${keywords} (Limit: ${limit})` }]
				};
			}
		);
	
	


		this.server.tool(
			"search_tweet_date_range",
			{
				startDate: z.string().optional().describe("Start date in YYYY-MM-DD format (optional)"),
				endDate: z.string().optional().describe("End date in YYYY-MM-DD format (optional)"),
				limit: z.number().min(1).max(500).optional().default(50).describe("Maximum number of records to return. Default: 50, Range: 1-500"),
			},
			async ({ startDate, endDate, limit = 50 }) => {
				try {
					const kvStore = (this.env as any)?.POSTS_DATA;
					if (!kvStore) {
						return {
							content: [{ type: "text", text: "KV storage not initialized" }],
						};
					}

					const csvData = await kvStore.get("posts_csv");
					if (!csvData) {
						return {
							content: [{ type: "text", text: "No CSV data found in storage" }],
						};
					}

					const posts = parseCSV(csvData);

					let filteredPosts = posts;
					
					if (startDate || endDate) {
						filteredPosts = posts.filter((post: PostRecord) => {
							if (!post.Date) return false;
							
							// Extract just the date part from the datetime string (YYYY-MM-DD)
							const postDateStr = post.Date.split(' ')[0];
							
							// Validate date format
							if (!/^\d{4}-\d{2}-\d{2}$/.test(postDateStr)) {
								return false;
							}
							
							const postDate = new Date(postDateStr + 'T00:00:00.000Z');
							
							// Check if date is valid
							if (isNaN(postDate.getTime())) {
								return false;
							}
							
							if (startDate) {
								const start = new Date(startDate + 'T00:00:00.000Z');
								if (postDate < start) return false;
							}
							
							if (endDate) {
								const end = new Date(endDate + 'T23:59:59.999Z');
								if (postDate > end) return false;
							}
							
							return true;
						});
					}

					// Set the limit with validation
					const recordLimit = Math.min(Math.max(limit, 1), 500);

					const resultText = `Found ${filteredPosts.length} posts${startDate || endDate ? ` between ${startDate || 'beginning'} and ${endDate || 'end'}` : ''}.\n` +
						`Showing first ${Math.min(recordLimit, filteredPosts.length)} of ${filteredPosts.length} results.\n\n` +
						(filteredPosts.length > 0 ? 
							`Date range in results: ${filteredPosts[0]?.Date?.split(' ')[0]} to ${filteredPosts[filteredPosts.length - 1]?.Date?.split(' ')[0]}\n\n` : '') +
						filteredPosts.slice(0, recordLimit).map((post: PostRecord) => 
							`Date: ${post.Date}\nAuthor: ${post.Name}\nPost: ${post.Post}\nLikes: ${post.Likes} | Reposts: ${post.Reposts} | Quotes: ${post.Quotes}\nURL: ${post.URL}`
						).join('\n\n');

					return {
						content: [{ type: "text", text: resultText }],
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					return {
						content: [{ type: "text", text: `Error processing request: ${errorMessage}` }],
					};
				}
			}
		);

	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
