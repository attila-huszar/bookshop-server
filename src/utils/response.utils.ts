import type {
  Author,
  Book,
  BookWithAuthor,
  News,
  Order,
  PublicUser,
  User,
} from '@/types'

/** API contracts expose customer data, not persistence/reconciliation internals. */
export function orderResponse(order: Order) {
  return {
    id: order.id,
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    total: order.total,
    currency: order.currency,
    items: order.items.map(
      ({ id, author, title, imgUrl, price, discount, quantity }) => ({
        id,
        author,
        title,
        imgUrl: imgUrl ?? '',
        price,
        discount,
        quantity,
      }),
    ),
    firstName: order.firstName ?? null,
    lastName: order.lastName ?? null,
    email: order.email ?? null,
    shipping: order.shipping ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

/** Only admins need order soft-delete metadata. */
export function cmsOrderResponse(order: Order) {
  return {
    ...orderResponse(order),
    deletedAt: order.deletedAt?.toISOString() ?? null,
  }
}

/** Explicit profile allowlist; never spread a database user into a response. */
export function publicUserResponse(user: User): PublicUser {
  return {
    uuid: user.uuid,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: user.address,
    avatar: user.avatar,
    country: user.country,
  }
}

export function adminUserResponse(user: User) {
  return {
    ...publicUserResponse(user),
    id: user.id,
    phone: user.phone ?? null,
    address: user.address ?? null,
    avatar: user.avatar ?? null,
    verified: user.verified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
  }
}

function bookFields(book: Omit<Book, 'authorId' | 'createdAt' | 'updatedAt'>) {
  const {
    id,
    title,
    genre,
    imgUrl,
    description,
    publishYear,
    rating,
    price,
    discount,
    discountPrice,
    topSellers,
    newRelease,
  } = book

  return {
    id,
    title,
    genre,
    imgUrl,
    description,
    publishYear,
    rating,
    price,
    discount,
    discountPrice,
    topSellers,
    newRelease,
  }
}

export function publicBookResponse(book: BookWithAuthor) {
  return { ...bookFields(book), author: book.author }
}

export function cmsBookResponse(book: Book) {
  return {
    ...bookFields(book),
    authorId: book.authorId,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }
}

export function authorResponse(author: Author) {
  const {
    id,
    name,
    fullName,
    birthYear,
    deathYear,
    homeland,
    biography,
    createdAt,
    updatedAt,
  } = author

  return {
    id,
    name,
    fullName,
    birthYear,
    deathYear,
    homeland,
    biography,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }
}

export function newsResponse(news: News) {
  const { id, title, content, img } = news

  return { id, title, content, img }
}
