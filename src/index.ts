import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { postRecord, allPosts, PostRecord } from "./schema.js";

// CSV parsing helper function
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

// CSV file reading helper function
function readCSVFile(filePath: string): PostRecord[] {
       const csvText = readFileSync(filePath, "utf8");
       return parseCSV(csvText);
}



// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Andrew MCP",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		this.server.tool(
			"get_post_date_range",
			{
				startDate: z.string().optional().describe("Start date in YYYY-MM-DD format"),
				endDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
			},
			async ({ startDate, endDate }) => {
				try {
					// In a Cloudflare Worker, you'd typically store the CSV in KV storage or D1
					// For now, we'll demonstrate with sample data that matches your CSV structure
					const sampleCsvData = `Name,Followers,Id,Date,Type,Post,URL,Languages,Reposts,Likes,Quotes,Year
@awilkinson,313841,1917680578100617363,2025-04-30 20:40:53,Post,Soon! From one anal retentive nerd who loves systems to another ❤️❤️❤️❤️,https://x.com/awilkinson/status/1917680578100617363,en,0,35,0,2025
@awilkinson,313841,1917622726417867178,2025-04-30 16:51:00,Post,Most of the things that are making you miserable are derived from luck.,https://x.com/awilkinson/status/1917622726417867178,en,5,42,2,2025
@awilkinson,313841,1917500000000000000,2025-04-29 14:30:00,Post,Another great post about productivity and systems.,https://x.com/awilkinson/status/1917500000000000000,en,12,78,5,2025`;

					// Parse the CSV data
					const posts = parseCSV(sampleCsvData);

					// Filter by date range
					let filteredPosts = posts;
					
					if (startDate || endDate) {
						filteredPosts = posts.filter((post: PostRecord) => {
							if (!post.Date) return false;
							
							const postDate = new Date(post.Date);
							
							if (startDate) {
								const start = new Date(startDate);
								if (postDate < start) return false;
							}
							
							if (endDate) {
								const end = new Date(endDate);
								if (postDate > end) return false;
							}
							
							return true;
						});
					}

					const resultText = `Found ${filteredPosts.length} posts${startDate || endDate ? ` between ${startDate || 'beginning'} and ${endDate || 'end'}` : ''}.\n\n` +
						filteredPosts.slice(0, 10).map((post: PostRecord) => 
							`Date: ${post.Date}\nAuthor: ${post.Name}\nPost: ${post.Post.substring(0, 150)}${post.Post.length > 150 ? '...' : ''}\nLikes: ${post.Likes} | Reposts: ${post.Reposts} | Quotes: ${post.Quotes}\nURL: ${post.URL}\n${'='.repeat(50)}`
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

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
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
