import model from '@/models'
import type { News, NewsInsert } from '@/types'

const { NewsModel } = model as MongoModel

export async function getNews(): Promise<News[]> {
  const news = await NewsModel.find().lean().exec()
  return news
}

export async function getNewsById(newsId: string): Promise<News | null> {
  const news = await NewsModel.findById(newsId).lean().exec()
  if (!news) return null
  return news
}

export async function insertNews(news: NewsInsert): Promise<News> {
  const { id, createdAt, updatedAt, ...newsData } = news
  const created = await NewsModel.create(newsData)
  const newsObj = created.toObject()
  return newsObj
}

export async function updateNews(
  newsId: string,
  news: Partial<NewsInsert>,
): Promise<News | null> {
  const updatedNews = await NewsModel.findByIdAndUpdate(newsId, news, {
    new: true,
  })
    .lean()
    .exec()
  if (!updatedNews) return null
  return updatedNews
}

export async function deleteNews(newsIds: string[]): Promise<News[]> {
  const deletedNews = await NewsModel.find({ _id: { $in: newsIds } })
    .lean()
    .exec()
  await NewsModel.deleteMany({ _id: { $in: newsIds } }).exec()
  return deletedNews
}
