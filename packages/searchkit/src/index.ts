import type { MultipleQueriesQuery as AlgoliaMultipleQueriesQuery } from '@algolia/client-search'
import { transformRequest } from './transformRequest'
import transformResponse, { getFacets, transformFacetValuesResponse } from './transformResponse'
import { SearchkitConfig, SearchRequest, RequestOptions, Transporter, AppSettings, ElasticsearchResponseBody, SearchSettingsConfig } from './types'
import { ESTransporter } from './Transporter'
import { getQueryRulesActionsFromRequest, QueryRuleActions } from './queryRules'
import { createElasticsearchQueryFromRequest } from './utils'
import { getIndexName } from './sorting'
export * from './types'
export * from './Transporter'
export * from './filterUtils'


import {
  ExampleNestedFiltersResponse,
  ExampleNestedMixedFacetResponse,
  ExampleNestedMixedFacetResponse2,
  ExampleNestedMixedFacetResponse3,
  ExampleNestedNumericFilterResponse
} from './___tests___/mocks/ElasticsearchResponses'

export default class Searchkit {
  private transporter: Transporter

  constructor(private config: SearchkitConfig, private settings: AppSettings = { debug: false }) {
    this.transporter =
      'msearch' in config.connection
        ? config.connection
        : new ESTransporter(config.connection, settings)
  }

  private async performSearch(requests: SearchRequest[]) {
    try {
      if (this.settings.debug) {
        console.log('Performing search with requests:')
        console.log('POST /_msearch')
        console.log(createElasticsearchQueryFromRequest(requests))
      }
      const responses = await this.transporter.msearch(requests)
      return responses
    } catch (err) {
      console.error(err)
      return []
    }
  }

  async handleInstantSearchRequests(
    instantsearchRequests: readonly AlgoliaMultipleQueriesQuery[],
    requestOptions?: RequestOptions
  ) {
    if (!instantsearchRequests || Array.isArray(instantsearchRequests) === false) {
      console.log({ instantsearchRequests })
      throw new Error(
        'No instantsearch requests provided. Check that the data you are providing from API request is correct. Likely you are not passing the request body correctly, its still a JSON string or the API is not a POST request.'
      )
    }

    const queryRules = this.config.search_settings.query_rules || []

    const requestQueryRuleActions: QueryRuleActions[] = instantsearchRequests.map((request) => {
      return getQueryRulesActionsFromRequest(queryRules, request, this.config.search_settings)
    })

    let esRequests: SearchRequest[] = instantsearchRequests.map((request, i) => ({
      body: transformRequest(
        request,
        this.config.search_settings,
        requestQueryRuleActions[i],
        requestOptions
      ),
      request: request,
      indexName: getIndexName(request.indexName, this.config.search_settings)
    }))

    if (requestOptions?.hooks?.beforeSearch) {
      esRequests = await requestOptions.hooks.beforeSearch(esRequests)
    }

    let esResponses = await this.performSearch(esRequests)

    if (requestOptions?.hooks?.afterSearch) {
      esResponses = await requestOptions.hooks.afterSearch(esRequests, esResponses)
    }

    try {
      const instantsearchResponses = esResponses.map((response, i) => {
        // @ts-ignore
        if (instantsearchRequests[i].params?.facetName) {
          return transformFacetValuesResponse(response, instantsearchRequests[i])
        }
        return transformResponse(
          response,
          instantsearchRequests[i],
          this.config.search_settings,
          requestQueryRuleActions[i]
        )
      })

      return {
        results: instantsearchResponses
      }
    } catch (err) {
      console.error(err)
      throw new Error(
        'Error transforming response. Check the afterSearch hook function is correct. Likely you are not returning the correct response object.'
      )
    }
  }

// My Manual Testing 
  getFacetTest = ()=>{
    // console.log('Tesing works');
    // const responseBody: ElasticsearchResponseBody = ExampleNestedMixedFacetResponse2;

    const responsesBag = ExampleNestedMixedFacetResponse3;
    responsesBag.responses.forEach((response: any)=>{

      const facets: any = getFacets(response, searchSettings);
  
      console.log('imback')
      // console.log({facets})
      console.log(facets.facets)
      if(facets.facets['keyword_facets.brand'])
        console.log('testNestedBrand', facets.facets['keyword_facets.brand']);

    })

    return 5;
  }
}

// manual Test Data;
const searchSettings: SearchSettingsConfig =  {
  highlight_attributes: ['title','description'],
  snippet_attributes: ['description:200'],
  search_attributes: [
    { field: 'title', weight: 3 },
    { field: 'categories', weight: 2 },
    // { field: 'brand', weight: 2 },
    'description', 'keyword_facets.facet_name', 'long_facets.facet_value'
  ],
  result_attributes: ['title', 'description', 'category', 'price', 'condition', 'status', 'tags', 'location', 'auth_user', 'item_image', 'lga', 'request_type', 'keyword_facets', 'long_facets'],
  facet_attributes: [
    // { attribute: 'brand', field: 'brand.keyword', type: 'string' },
    {
      attribute: 'categories.lvl0',
      field: 'hierarchicalCategories.lvl0.keyword',
      type: 'string'
    },
    {
      attribute: 'categories.lvl1',
      field: 'hierarchicalCategories.lvl1.keyword',
      type: 'string'
    },
    {
      attribute: 'categories.lvl2',
      field: 'hierarchicalCategories.lvl2.keyword',
      type: 'string'
    },
    // ...dynamicFields,

    { attribute: 'lga', field: 'lga', type: 'string' },
    { attribute: 'lga2', field: 'lga', type: 'string'},
    {
      attribute: 'request_type',
      field: 'request_type',
      type: 'string'
    },
    {
      // attribute: 'brand_keyword_facets',
      attribute: 'keyword_facets.brand',
      field: 'facet_value',
      type: 'string',
      nestedPath: 'keyword_facets',
      facetQuery: (field, size, search) => {
        console.log('facetQuery', { field }, { size }, { search });

        // this only works
        // "terms": {
        //   "field": "keyword_facets.facet_value",
        //   "size": size
        // }
        return {
          // "nested": {
          //   "path": "keyword_facets"
          // },
          // "aggs": {
          //   "brand": {
              "filter": {
                "term": {
                  "keyword_facets.facet_name": "brand"
                }
              },
              "aggs": {
                "keyword_facets.brand": {
                  "terms": {
                    "field": "keyword_facets.facet_value",
                    "size": size
                  }
                }
              }
          //   }
          // }
        };
      },
      filterQuery: (
        field: string,
        value: string,
      ): any => {
        console.log('filterQuery', {field}, {value});
        return {
          // nested: {
          //   path: 'keyword_facets',
          //   query: {
          //     // match_all: {},
          //     bool: {
                filter: [
                  { term: { 'keyword_facets.facet_name': 'brand' } },
                  { term: { ['keyword_facets.facet_value']: value } }, //
                  // { term: { [`${field}`]: value } }, //keyword_facets.facet_value
                ],
          //     },
          //   },
          // },
        };
      },
      // getFacets
      facetResponse: (aggregation) => {
        console.log('facetResponse', { aggregation });
        // if (aggregation === undefined) return {};

        // //debug
        // return {"Apple":20};

        // const buckets = aggregation.brand_keyword_facets.facet_value.buckets;
        const buckets = aggregation.buckets || [];
        // const buckets = aggregation.buckets;
        return buckets?.reduce((acc: any, bucket: any) => {
          acc[bucket.key] = bucket.doc_count;
          // console.log('FOUND', { acc });
          return acc;
        }, {});

        // console.log('facetResponse', JSON.stringify(aggregation, null, 2));
        // if (!aggregation.brand_facets || !aggregation.brand_facets.facet_value || !aggregation.brand_facets.facet_value.buckets) {
        //   return {};
        // }
        // const buckets = aggregation.brand_facets.facet_value.buckets;
        // return buckets.reduce((acc: FacetStringResponse, bucket: any) => {
        //   acc[bucket.key] = bucket.doc_count;
        //   return acc;
        // }, {});

      },
    },


    /*
    {
      attribute: 'brand_keyword_facets',
      field: 'facet_value',
      // identifier: 'brand',
      // label: 'brand',
      type: 'string', //nested
      nestedPath: 'keyword_facets',
      // size: 10,
      query:{
        nested: {
          path: 'keyword_facets',
          query: {
            bool: {
              filter: [
                { term: { 'keyword_facets.facet_name': 'brand' } }
              ]
            }
          }
        }
      },
      aggs: {
        brand_keyword_facet: {
          nested: {
            path: 'keyword_facets'
          },
          aggs: {
            facet_value: {
              filter: { "term": { "keyword_facets.facet_name": "brand" } },
              terms: {
                field: 'keyword_facets.facet_value'
              }
            }
          }
        }
      }
    },
    */

    {
      attribute: 'price',
      field: 'price',
      type: 'numeric'
    }
  ],
  filter_attributes: [
    {
      attribute: 'categories',
      field: 'categories.keyword',
      type: 'string'
    }
  ],
  sorting: {
    default: {
      field: '_score',
      order: 'desc'
    },
    _price_desc: {
      field: 'price',
      order: 'desc'
    },
    _price_asc: {
      field: 'price',
      order: 'asc'
    }
  },
  query_rules: [
    {
      id: 'default-state',
      conditions: [[]],
      actions: [
        {
          action: 'RenderFacetsOrder',
          facetAttributesOrder: [
            'categories.lvl0',
            'categories.lvl1',
            'categories.lvl2',
            'brand',
            'brand.facet_value',
            // 'Brand',
            'request_type',
            'lga',
            'lga2',
            'brand_keyword_facets',
            'keyword_facets',
            'brand',
            'keyword_facets.brand',
            'keyword_facets.facet_name',
            'facet_value',
            'facet_name',
            'anything',
            'price'
          ]
        }
      ]
    },

    // {
    //   id: 'pinned-item',
    //   conditions: [
    //     [
    //       {
    //         context: 'filterPresent',
    //         values: [
    //           {
    //             attribute: 'categories.lvl0',
    //             value: 'Computers & Tablets'
    //           }
    //         ]
    //       }
    //     ]
    //   ],
    //   actions: [
    //     {
    //       action: "PinnedResult",
    //       documentIds: ["4464298"] // _id of the document to pin
    //     },
    //   ]
    // },


    {
      id: 'cheap-tvs',
      conditions: [
        [
          {
            context: 'query',
            value: 'cheap tvs',
            match_type: 'exact'
          }
        ]
      ],
      actions: [
        {
          action: 'QueryRewrite',
          query: ''
        },
        {
          action: 'QueryFilter',
          query: 'price:[0 TO 500] AND categories:TVs'
        },
        {
          action: 'QueryBoost',
          query: 'brand:LG',
          weight: 10
        }
      ]
    },
    {
      id: 'tv-categories-facet',
      conditions: [
        [
          {
            context: 'filterPresent',
            values: [
              {
                attribute: 'categories.lvl1',
                value: 'TV & Home Theater > TVs'
              }
            ]
          }
        ]
      ],
      actions: [
        {
          action: 'RenderFacetsOrder',
          facetAttributesOrder: [
            'categories.lvl0',
            'categories.lvl1',
            'categories.lvl2',
            'brand',
            // 'Brand',
            'keyword_facets.facet_value',
            'price'
          ]
        }
      ]
    },
    {
      id: 'tv-categories-banner',
      conditions: [
        [
          {
            context: 'filterPresent',
            values: [
              {
                attribute: 'categories.lvl1',
                value: 'TV & Home Theater > TVs'
              }
            ]
          }
        ]
      ],
      actions: [
        {
          action: 'RenderUserData',
          userData: JSON.stringify({
            title: 'We have TVs!',
            body: 'Check out our TVs',
            url: 'https://www.samsung.com'
          })
        }
      ]
    }
  ],
};