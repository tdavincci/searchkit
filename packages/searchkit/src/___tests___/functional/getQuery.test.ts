import Client, { AlgoliaMultipleQueriesQuery } from '../../'
import nock from 'nock'
import { DisjunctiveExampleRequest } from '../mocks/AlgoliaRequests'
import { HitsResponseWithFacetFilter } from '../mocks/ElasticsearchResponses'

describe('GetQuery Extension', () => {
  const client = new Client({
    connection: {
      host: 'http://localhost:9200',
      apiKey: 'a2Rha1VJTUJMcGU4ajA3Tm9fZ0Y6MjAzX2pLbURTXy1hNm9SUGZGRlhJdw=='
    },
    search_settings: {
      highlight_attributes: ['title', 'actors'],
      search_attributes: ['title', 'actors', 'query'],
      result_attributes: ['title', 'actors', 'query'],
      facet_attributes: [
        'type',
        { field: 'actors.keyword', attribute: 'actors', type: 'string' },
        'rated'
      ],
      query_rules: [
        {
          id: '1',
          conditions: [
            [
              {
                context: 'query',
                value: 'shawshank',
                match_type: 'exact'
              }
            ]
          ],
          actions: [
            {
              action: 'PinnedResult',
              documentIds: ['tt0111161']
            }
          ]
        }
      ]
    }
  })

  it('GetQuery Extension with query rules', async () => {
    nock('http://localhost:9200')
      .post('/_msearch', (requestBody: any) => {
        expect(requestBody).toMatchSnapshot('ES Request')
        const x = JSON.parse(requestBody.split('\n')[1]).query
        expect(x).toMatchInlineSnapshot(`
          {
            "bool": {
              "filter": [
                {
                  "bool": {
                    "should": [
                      {
                        "term": {
                          "type": "movie",
                        },
                      },
                    ],
                  },
                },
              ],
              "must": {
                "function_score": {
                  "functions": [],
                  "query": {
                    "pinned": {
                      "ids": [
                        "tt0111161",
                      ],
                      "organic": {
                        "multi_match": {
                          "fields": [
                            "title",
                            "actors",
                            "query",
                          ],
                          "query": "shawshank",
                        },
                      },
                    },
                  },
                },
              },
            },
          }
        `)
        return true
      })
      .reply(200, HitsResponseWithFacetFilter)

    const response = await client.handleInstantSearchRequests(
      DisjunctiveExampleRequest as AlgoliaMultipleQueriesQuery[],
      {
        getQuery(query, search_attributes) {
          expect(query).toBe('shawshank')
          return {
            multi_match: {
              query,
              fields: search_attributes as string[]
            }
          }
        }
      }
    )

    expect(response).toMatchSnapshot()
  })

  it('GetQuery Extension with no matching query rules actions', async () => {
    nock('http://localhost:9200')
      .post('/_msearch', (requestBody: any) => {
        expect(requestBody).toMatchSnapshot('ES Request')
        const x = JSON.parse(requestBody.split('\n')[1]).query
        expect(x).toMatchInlineSnapshot(`
          {
            "bool": {
              "filter": [
                {
                  "bool": {
                    "should": [
                      {
                        "term": {
                          "type": "movie",
                        },
                      },
                    ],
                  },
                },
              ],
              "must": {
                "multi_match": {
                  "fields": [
                    "title",
                    "actors",
                    "query",
                  ],
                  "query": "test",
                },
              },
            },
          }
        `)
        return true
      })
      .reply(200, HitsResponseWithFacetFilter)

    const response = await client.handleInstantSearchRequests(
      DisjunctiveExampleRequest.map((request) => ({
        ...request,
        params: { ...request.params, query: 'test' }
      })) as AlgoliaMultipleQueriesQuery[],
      {
        getQuery(query, search_attributes) {
          expect(query).toBe('test')
          return {
            multi_match: {
              query,
              fields: search_attributes as string[]
            }
          }
        }
      }
    )

    expect(response).toMatchSnapshot()
  })

  it('do not apply organic query when set to false', async () => {
    nock('http://localhost:9200')
      .post('/_msearch', (requestBody: any) => {
        expect(requestBody).toMatchSnapshot('ES Request')
        const x = JSON.parse(requestBody.split('\n')[1]).query
        expect(x).toMatchInlineSnapshot(`
          {
            "bool": {
              "filter": [
                {
                  "bool": {
                    "should": [
                      {
                        "term": {
                          "type": "movie",
                        },
                      },
                    ],
                  },
                },
              ],
              "must": {
                "match_all": {},
              },
            },
          }
        `)
        return true
      })
      .reply(200, HitsResponseWithFacetFilter)

    const response = await client.handleInstantSearchRequests(
      DisjunctiveExampleRequest.map((request) => ({
        ...request,
        params: { ...request.params, query: 'test' }
      })) as AlgoliaMultipleQueriesQuery[],
      {
        getQuery(query, search_attributes) {
          return false
        }
      }
    )

    expect(response).toMatchSnapshot()
  })
})
