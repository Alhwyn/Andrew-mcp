import { z } from "zod";

export const postRecord = z.object({
	Name: z.string(),
	Followers: z.string(),
	Id: z.string(),
	Date: z.string(),
	Type: z.string(),
	Post: z.string(),
	URL: z.string(),
	Languages: z.string(),
	Reposts: z.string(),
	Likes: z.string(),
	Quotes: z.string(),
	Year: z.string(),
});

const ThumbnailSchema = z.object({
	url: z.string().url(),
	filename: z.string(),
});
// bog
const VideoSummarySchema = z.object({
	state: z.string(),
	value: z.string(),
	isStale: z.boolean(),
});

export const YouTubeDropSchema = z.object({
	id: z.string(),
	createdTime: z.string(),
	fields: z.object({
		"Youtube Link": z.string().url(),
		Thumbnail: z.array(ThumbnailSchema).optional(),
		"Channel Name": z.string(),
		"Video Title": z.string(),
		"Video Summary": VideoSummarySchema.optional(),
		"Record ID": z.string(),
		Keywords: z.array(z.string()).optional(),
		"Keyword Rollup": z.array(z.string()).optional(),
	}),
});

export const Transcript = z.object({
	id: z.string(),
	createdTime: z.string(),
	fields: z.object({
		"Transcription": z.string(),
	}),
});




export const allPosts = z.array(postRecord);

export type PostRecord = z.infer<typeof postRecord>;
export type YoutubeLinkDropRecord = z.infer<typeof YouTubeDropSchema>;
export type Thumbnail = z.infer<typeof ThumbnailSchema>;
export type Transcription = z.infer<typeof Transcript>;

