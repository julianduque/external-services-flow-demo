
export default async function (fastify, opts) {
  fastify.addSchema({
    description: 'Represents an order',
    $id: 'order',
    type: 'object',
    properties: {
      orderId: { type: 'integer' },
      productId: { type: 'integer' },
      quantity: { type: 'integer' }
    }
  })

  fastify.addSchema({
    description: 'Represents a restocking order request',
    $id: 'restockOrder',
    type: 'object',
    required: ['productId', 'quantity'],
    properties: {
      productId: { type: 'integer' },
      quantity: { type: 'integer', minimum: 10 }
    }
  })

  fastify.addSchema({
    description: 'Represents an error',
    $id: 'error',
    type: 'object',
    properties: {
      error: { type: 'string' }
    }
  })

  fastify.addSchema({
    description: 'Represents a boolean indicating if there is a pending order',
    $id: 'pending',
    type: 'object',
    properties: {
      pending: { type: 'boolean' }
    }
  })

  const orderSchema = {
    description: 'Create a new restocking order',
    body: {
      $ref: 'restockOrder#'
    },
    response: {
      201: {
        description: 'Returns the created order',
        $ref: 'order#'
      },
      500: {
        description: 'Returns an error',
        $ref: 'error#'
      }
    }
  }

  const pendingSchema = {
    description: 'Check if there is a pending restocking order for a product',
    params: {
      type: 'object',
      required: ['productId'],
      properties: {
        productId: { type: 'integer' }
      }
    },
    response: {
      200: {
        description: 'Returns a boolean indicating if there is a pending order',
        $ref: 'pending#'
      },
      500: {
        description: 'Returns an error',
        $ref: 'error#'
      }
    }
  }

  // Create a new restocking order
  fastify.post('/order', { schema: orderSchema }, async function (request, reply) {
    const client = await fastify.pg.connect()
    try {
      const productId = request.body.productId
      const quantity = request.body.quantity

      // Validate if product exists
      await validateProduct(client, productId)

      // Create a new order
      const { rows } = await client.query(`
        INSERT INTO orders (product_id, quantity, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id
      `, [productId, quantity])

      const orderId = rows[0].id
      reply.code(201).send({ orderId, productId, quantity })
    } catch (err) {
      reply.code(500).send({ error: err.message })
    } finally {
      client.release()
    }
  })

  // Check if there is a pending restocking order for a product
  fastify.get('/order/pending/:productId', { schema: pendingSchema }, async function (request, reply) {
    const client = await fastify.pg.connect()
    try {
      const productId = request.params.productId

      // Validate if product exists
      await validateProduct(client, productId)

      // Get all orders for a product that hasn't been fulfilled
      const { rows } = await client.query(`
        SELECT id FROM orders
        WHERE product_id = $1 AND fulfilled = false
      `, [productId])

      const pending = rows.length > 0
      reply.code(200).send({ pending })
    } catch (err) {
      reply.code(500).send({ error: err.message })
    } finally {
      client.release()
    }
  })

  // Validate if a product exists
  async function validateProduct (client, productId) {
    const { rows } = await client.query('SELECT id FROM products WHERE id = $1', [productId])
    if (rows.length === 0) {
      throw new Error(`Product with id (${productId}) not found`)
    }
  }
}
