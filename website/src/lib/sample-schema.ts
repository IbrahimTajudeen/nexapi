// Copy of fixtures/openapi/basic.yaml (a test keeps them identical).
export const SAMPLE_SCHEMA = `openapi: 3.0.3
info:
  title: NyxAPI Example API
  version: 1.0.0
paths:
  /auth/login:
    post:
      operationId: login
      summary: Exchange credentials for a session token
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/LoginRequest" }
      responses:
        "200":
          description: Logged in
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Session" }
        "401":
          description: Bad credentials
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ApiError" }
  /users:
    get:
      operationId: listUsers
      summary: List users
      parameters:
        - { name: page, in: query, schema: { type: integer, minimum: 1 } }
        - { name: limit, in: query, schema: { type: integer, maximum: 100 } }
        - name: role
          in: query
          schema: { type: array, items: { $ref: "#/components/schemas/Role" } }
      responses:
        "200":
          description: A page of users
          content:
            application/json:
              schema: { $ref: "#/components/schemas/UserList" }
  /users/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      operationId: getUser
      summary: Fetch one user
      responses:
        "200":
          description: The user
          content:
            application/json:
              schema: { $ref: "#/components/schemas/User" }
        "404":
          description: Not found
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ApiError" }
    patch:
      operationId: updateUser
      summary: Update a user
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UserPatch" }
      responses:
        "200":
          description: The updated user
          content:
            application/json:
              schema: { $ref: "#/components/schemas/User" }
        "422":
          description: Validation failed
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ApiError" }
    delete:
      operationId: deleteUser
      summary: Delete a user
      deprecated: true
      responses:
        "204":
          description: Deleted
  /users/{id}/avatar:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      operationId: getAvatar
      summary: Download the user's avatar
      responses:
        "200":
          description: The image
          content:
            image/png:
              schema: { type: string, format: binary }
    post:
      operationId: uploadAvatar
      summary: Upload an avatar
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file: { type: string, format: binary }
                caption: { type: string }
                tags: { type: array, items: { type: string } }
      responses:
        "200":
          description: Stored
          content:
            application/json:
              schema:
                type: object
                required: [bytes]
                properties:
                  bytes: { type: integer }
                  caption: { type: string }
                  tags: { type: array, items: { type: string } }
  /exports/users:
    get:
      operationId: exportUsers
      summary: Users as CSV
      parameters:
        - { name: columns, in: query, explode: false, schema: { type: array, items: { type: string } } }
        - name: filter
          in: query
          style: deepObject
          explode: true
          schema:
            type: object
            properties:
              role: { type: string }
      responses:
        "200":
          description: CSV text
          content:
            text/csv:
              schema: { type: string }
components:
  schemas:
    Role:
      type: string
      enum: [admin, member]
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string }
    Session:
      type: object
      required: [token, user]
      properties:
        token: { type: string }
        user: { $ref: "#/components/schemas/User" }
    User:
      type: object
      required: [id, name, role]
      properties:
        id: { type: string }
        name: { type: string }
        email: { type: string, nullable: true }
        role: { $ref: "#/components/schemas/Role" }
    UserPatch:
      type: object
      properties:
        name: { type: string }
        email: { type: string, nullable: true }
        role: { $ref: "#/components/schemas/Role" }
    UserList:
      type: object
      required: [items, total]
      properties:
        items:
          type: array
          items: { $ref: "#/components/schemas/User" }
        total: { type: integer }
    ApiError:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }
`;

// Copy of fixtures/graphql/blog.graphql (a test keeps them identical).
export const GRAPHQL_SAMPLE = `"A blog API"
scalar DateTime

enum Role { ADMIN EDITOR READER }

interface Node { id: ID! }

type User implements Node {
  id: ID!
  name: String!
  email: String
  role: Role!
  createdAt: DateTime!
  posts(first: Int = 10): [Post!]!
}

type Post implements Node {
  id: ID!
  title: String!
  body: String
  author: User!
  tags: [String!]!
}

union SearchResult = User | Post

input NewPost { title: String!, body: String, tags: [String!] }

type Query {
  user(id: ID!): User
  users(role: Role): [User!]!
  search(text: String!): [SearchResult!]!
  me: User
}

type Mutation {
  createPost(input: NewPost!): Post!
  deletePost(id: ID!): Boolean!
}

type Subscription { postAdded: Post! }
`;
