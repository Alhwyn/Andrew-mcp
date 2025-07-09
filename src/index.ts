import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import  { PostRecord, YoutubeLinkDropRecord } from "./schema.js";
import { Transcription, YouTubeDropSchema } from "./schema.js";
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
	limit: number = 50,
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

	const raw = await base("Youtube Link Drop")
		.select({
			maxRecords: limit,
			view: "All Data",
			fields: [
				"Youtube Link",
				"Thumbnail", 
				"Channel Name",
				"Video Title",
				"Video Summary",
				"Record ID",   
				"Keyword Rollup"
			]
		})
		.all();

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

export async function getTranscribedPodcast(
	recordId: string,
	env: any,
): Promise<String> {
	const AIRTABLE_API_TOKEN = env.AIRTABLE_API_TOKEN;
	const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;

	if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID) {
		throw new Error("Airtable credentials not found in environment");
	}

	const base = new Airtable({ apiKey: AIRTABLE_API_TOKEN }).base(
		AIRTABLE_BASE_ID,
	);

	try {
		const record = await base('Youtube Link Drop').find(recordId);

		const result: Transcription = {
			id: record.id,
			createdTime: record._rawJson.createdTime,
			fields: { Transcription: String(record.fields.Transcription || "") }
		};

	
		return result.fields.Transcription;
	} catch (err) {
		console.error('Error retrieving record:', err);
		throw err;
	}
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Andrew MCP",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"list_podcast",
			"Lists all podcast summary records from Airtable",
			{
				limit: z.number().min(1).max(500).optional().default(50).describe("Maximum number of records to return. Default: 50, Range: 1-500"),
			},
			async ({ limit }) => {
				try {
					const drops = await listYouTubeDrops(limit, this.env);
					console.log(`Found ${drops.length} valid records:\n`);


					

					// Return the raw drops data for debugging first
					const debugInfo = `Found ${drops.length} podcast summaries:\n\n` +
						`Raw drops data:\n${JSON.stringify(drops, null, 2)}`;

					return {
						content: [
							{
								type: "text",
								text: debugInfo,
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
			"get_youtube_transcript",
			"Retrieves detailed transcript and information for a specific YouTube podcast. You must first call list_podcast to get the record IDs for available podcasts.",
			{
				recordId: z.string().describe("The record ID of the YouTube drop to retrieve (get this from list_podcast results)"),
			},
			async ({recordId}) => {
				try {
						const getTranscript = await getTranscribedPodcast(recordId, this.env);
						console.log(`${getTranscript} valid records:\n`);

						const debugInfo = `Raw drops data:\n${JSON.stringify(getTranscript, null, 2)}`;

						return {
							content: [
								{
									type: "text",
									text: debugInfo,
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
			}
		);

		this.server.tool(
			"search_tweets",
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
