import { z } from 'zod';

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

export const allPosts = z.array(postRecord);

export type PostRecord = z.infer<typeof postRecord>;