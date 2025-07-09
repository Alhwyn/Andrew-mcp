import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PostRecord, YoutubeLinkDropRecord } from "./schema.js";
import { YouTubeDropSchema } from "./schema.js";
import Airtable from "airtable";

// Don't initialize Airtable here - do it in the functions that need it

function parseCSV(csvText: string): PostRecord[] {
	const lines = csvText.split("\n");
	const headers = lines[0].split(",");

	return lines
		.slice(1)
		.filter((line: string) => line.trim())
		.map((line: string) => {
			const values = line.split(",");
			const post: any = {};
			headers.forEach((header: string, index: number) => {
				post[header] = values[index] || "";
			});
			return post as PostRecord;
		});
}

export async function listYouTubeDrops(
	env: any,
): Promise<YoutubeLinkDropRecord[]> {
	const AIRTABLE_API_TOKEN = env.AIRTABLE_API_TOKEN;
	const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;

	if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID) {
		throw new Error("Airtable credentials not found in environment");
	}

	const base = new Airtable({ apiKey: AIRTABLE_API_TOKEN }).base(
		AIRTABLE_BASE_ID,
	);

	const raw = await base("Youtube Link Drop").select().all();

	console.log(
		"Raw Airtable data structure (first record):",
		JSON.stringify(raw[0], null, 2),
	);

	const parsed = raw.map(
		(rec: { id: any; _rawJson: { createdTime: any }; fields: any }) =>
			YouTubeDropSchema.safeParse({
				id: rec.id,
				createdTime: rec._rawJson.createdTime,
				fields: rec.fields,
			}),
	);

	const successes = parsed
		.filter((p: { success: any }) => p.success)
		.map((p: any) => p.data);
	const errors = parsed
		.filter((p: { success: any }) => !p.success)
		.map((p: any) => p.error);

	if (errors.length) {
		console.error("Validation errors:");
		errors.forEach((error, index) => {
			console.error(`Error ${index + 1}:`, JSON.stringify(error, null, 2));
		});

		// Also log the raw data for the first few failed records to see the structure
		console.error("Sample raw data from failed records:");
		raw.slice(0, 3).forEach((rec, index) => {
			console.error(
				`Raw record ${index + 1}:`,
				JSON.stringify(
					{
						id: rec.id,
						createdTime: rec._rawJson?.createdTime,
						fields: rec.fields,
					},
					null,
					2,
				),
			);
		});
	}

	return successes;
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Andrew MCP",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"list_podcast_summaries",
			"Lists all podcast summary records from Airtable",
			async () => {
				try {
					const drops = await listYouTubeDrops(this.env);
					console.log(`Found ${drops.length} valid records:\n`);

					for (const d of drops) {
						console.log(
							`→ [${d.id}] ${d.fields["Video Title"]} (${d.fields["Channel Name"]})`,
						);
						console.log(`   Link: ${d.fields["Youtube Link"]}`);

						// Handle Video Summary which can be either string or object
						const summary = d.fields["Video Summary"];
						if (summary) {
							const summaryText =
								typeof summary === "string" ? summary : summary.value;
							console.log(`   Summary: ${summaryText}`);
						}

						console.log(`   Keywords: ${d.fields["Keywords"]?.join(", ")}`);
						console.log("---");
					}

					// Format the podcast data for return
					const podcastData = drops.map(d => {
						const summary = d.fields["Video Summary"];
						const summaryText = summary 
							? (typeof summary === "string" ? summary : summary.value)
							: "No summary available";
						
						return {
							id: d.id,
							title: d.fields["Video Title"],
							channel: d.fields["Channel Name"],
							link: d.fields["Youtube Link"],
							summary: summaryText,
							keywords: d.fields["Keywords"]?.join(", ") || "No keywords",
							keywordRollup: d.fields["Keyword Rollup"] || "No keyword rollup",
							createdTime: d.createdTime
						};
					});

					const formattedText = `Found ${drops.length} podcast summaries:\n\n` +
						podcastData.map(podcast => 
							`Title: ${podcast.title}\n` +
							`Channel: ${podcast.channel}\n` +
							`Link: ${podcast.link}\n` +
							`Summary: ${podcast.summary}\n` +
							`Keywords: ${podcast.keywords}\n` +
							`Keyword Rollup: ${podcast.keywordRollup}\n` +
							`Created: ${podcast.createdTime}\n` +
							`---`
						).join('\n');

					return {
						content: [
							{
								type: "text",
								text: formattedText,
							},
						],
					};
				} catch (error) {
					console.error("Error in list_podcast_summaries:", error);
					return {
						content: [
							{
								type: "text",
								text: "An error occurred while retrieving podcast summaries.",
							},
						],
						isError: true,
					};
				}
			},
		);

		this.server.tool(
			"search_tweet_date_range",
			{
				startDate: z
					.string()
					.optional()
					.describe("Start date in YYYY-MM-DD format (optional)"),
				endDate: z
					.string()
					.optional()
					.describe("End date in YYYY-MM-DD format (optional)"),
				limit: z
					.number()
					.min(1)
					.max(500)
					.optional()
					.default(50)
					.describe(
						"Maximum number of records to return. Default: 50, Range: 1-500",
					),
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
							const postDateStr = post.Date.split(" ")[0];

							// Validate date format
							if (!/^\d{4}-\d{2}-\d{2}$/.test(postDateStr)) {
								return false;
							}

							const postDate = new Date(postDateStr + "T00:00:00.000Z");

							// Check if date is valid
							if (isNaN(postDate.getTime())) {
								return false;
							}

							if (startDate) {
								const start = new Date(startDate + "T00:00:00.000Z");
								if (postDate < start) return false;
							}

							if (endDate) {
								const end = new Date(endDate + "T23:59:59.999Z");
								if (postDate > end) return false;
							}

							return true;
						});
					}

					// Set the limit with validation
					const recordLimit = Math.min(Math.max(limit, 1), 500);

					const resultText =
						`Found ${filteredPosts.length} posts${startDate || endDate ? ` between ${startDate || "beginning"} and ${endDate || "end"}` : ""}.\n` +
						`Showing first ${Math.min(recordLimit, filteredPosts.length)} of ${filteredPosts.length} results.\n\n` +
						(filteredPosts.length > 0
							? `Date range in results: ${filteredPosts[0]?.Date?.split(" ")[0]} to ${filteredPosts[filteredPosts.length - 1]?.Date?.split(" ")[0]}\n\n`
							: "") +
						filteredPosts
							.slice(0, recordLimit)
							.map(
								(post: PostRecord) =>
									`Date: ${post.Date}\nAuthor: ${post.Name}\nPost: ${post.Post}\nLikes: ${post.Likes} | Reposts: ${post.Reposts} | Quotes: ${post.Quotes}\nURL: ${post.URL}`,
							)
							.join("\n\n");

					return {
						content: [{ type: "text", text: resultText }],
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : "Unknown error";
					return {
						content: [
							{
								type: "text",
								text: `Error processing request: ${errorMessage}`,
							},
						],
					};
				}
			},
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
