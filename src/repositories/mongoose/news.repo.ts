import model from '@/models'
import type { News, NewsInsert } from '@/types'

const { NewsModel } = model as MongoModel

export async function getNews(): Promise<News[]> {
  const newsArray = await NewsModel.find().lean()
  return newsArray.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))
}

export async function getNewsById(newsId: string): Promise<News | null> {
  const news = await NewsModel.findById(newsId).lean()
  if (!news) return null
  return {
    ...news,
    createdAt: news.createdAt.toISOString(),
    updatedAt: news.updatedAt.toISOString(),
  }
}

export async function insertNews(news: NewsInsert): Promise<News> {
  const { id, createdAt, updatedAt, ...newsData } = news
  const created = await NewsModel.create(newsData)
  const newsObj = created.toObject()
  return {
    ...newsObj,
    createdAt: newsObj.createdAt.toISOString(),
    updatedAt: newsObj.updatedAt.toISOString(),
  }
}

export async function updateNews(
  newsId: string,
  news: Partial<NewsInsert>,
): Promise<News | null> {
  const updated = await NewsModel.findByIdAndUpdate(newsId, news, {
    new: true,
  }).lean()
  if (!updated) return null
  return {
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function deleteNews(newsIds: string[]): Promise<News[]> {
  const deleted = await NewsModel.find({ _id: { $in: newsIds } }).lean()
  await NewsModel.deleteMany({ _id: { $in: newsIds } })
  return deleted.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))
}
