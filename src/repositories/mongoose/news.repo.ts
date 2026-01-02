import model from '@/models'
import type { News, NewsInsert } from '@/types'

const { NewsModel } = model as MongoModel

export async function getNews(): Promise<News[]> {
  const news = await NewsModel.find().lean()
  return news.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    img: item.img ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))
}

export async function getNewsById(newsId: string): Promise<News | null> {
  const news = await NewsModel.findById(newsId).lean()
  if (!news) return null

  return {
    id: news.id,
    title: news.title,
    content: news.content,
    img: news.img ?? null,
    createdAt: news.createdAt.toISOString(),
    updatedAt: news.updatedAt.toISOString(),
  }
}

export async function insertNews(news: NewsInsert): Promise<News> {
  const created = await NewsModel.create(news)
  const savedNews = created.toObject()

  return {
    id: savedNews.id,
    title: savedNews.title,
    content: savedNews.content,
    img: savedNews.img ?? null,
    createdAt: savedNews.createdAt.toISOString(),
    updatedAt: savedNews.updatedAt.toISOString(),
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
    id: updated.id,
    title: updated.title,
    content: updated.content,
    img: updated.img ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function deleteNews(newsIds: string[]): Promise<News[]> {
  const deleted = await NewsModel.find({ _id: { $in: newsIds } }).lean()
  await NewsModel.deleteMany({ _id: { $in: newsIds } })

  return deleted.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    img: item.img ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))
}
