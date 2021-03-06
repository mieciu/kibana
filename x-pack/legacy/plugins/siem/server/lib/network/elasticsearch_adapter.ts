/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { get, getOr } from 'lodash/fp';

import {
  FlowDirection,
  FlowTarget,
  NetworkDnsData,
  NetworkDnsEdges,
  NetworkTopNFlowData,
  NetworkTopNFlowEdges,
} from '../../graphql/types';
import { inspectStringifyObject } from '../../utils/build_query';
import { DatabaseSearchResponse, FrameworkAdapter, FrameworkRequest } from '../framework';
import { TermAggregation } from '../types';
import { DEFAULT_MAX_TABLE_QUERY_SIZE } from '../../../common/constants';

import { NetworkDnsRequestOptions, NetworkTopNFlowRequestOptions } from './index';
import { buildDnsQuery } from './query_dns.dsl';
import { buildTopNFlowQuery } from './query_top_n_flow.dsl';
import { NetworkAdapter, NetworkDnsBuckets, NetworkTopNFlowBuckets } from './types';

export class ElasticsearchNetworkAdapter implements NetworkAdapter {
  constructor(private readonly framework: FrameworkAdapter) {}

  public async getNetworkTopNFlow(
    request: FrameworkRequest,
    options: NetworkTopNFlowRequestOptions
  ): Promise<NetworkTopNFlowData> {
    const dsl = buildTopNFlowQuery(options);
    const response = await this.framework.callWithRequest<NetworkTopNFlowData, TermAggregation>(
      request,
      'search',
      dsl
    );
    const { activePage, cursorStart, fakePossibleCount, querySize } = options.pagination;
    const totalCount = getOr(0, 'aggregations.top_n_flow_count.value', response);
    const networkTopNFlowEdges: NetworkTopNFlowEdges[] = getTopNFlowEdges(response, options);
    const fakeTotalCount = fakePossibleCount <= totalCount ? fakePossibleCount : totalCount;
    const edges = networkTopNFlowEdges.splice(cursorStart, querySize - cursorStart);
    const inspect = {
      dsl: [inspectStringifyObject(dsl)],
      response: [inspectStringifyObject(response)],
    };
    const showMorePagesIndicator = totalCount > fakeTotalCount;

    return {
      edges,
      inspect,
      pageInfo: {
        activePage: activePage ? activePage : 0,
        fakeTotalCount,
        showMorePagesIndicator,
      },
      totalCount,
    };
  }

  public async getNetworkDns(
    request: FrameworkRequest,
    options: NetworkDnsRequestOptions
  ): Promise<NetworkDnsData> {
    const dsl = buildDnsQuery(options);
    const response = await this.framework.callWithRequest<NetworkDnsData, TermAggregation>(
      request,
      'search',
      dsl
    );
    const { activePage, cursorStart, fakePossibleCount, querySize } = options.pagination;
    const totalCount = getOr(0, 'aggregations.dns_count.value', response);
    const networkDnsEdges: NetworkDnsEdges[] = formatDnsEdges(
      getOr([], 'aggregations.dns_name_query_count.buckets', response)
    );
    const fakeTotalCount = fakePossibleCount <= totalCount ? fakePossibleCount : totalCount;
    const edges = networkDnsEdges.splice(cursorStart, querySize - cursorStart);
    const inspect = {
      dsl: [inspectStringifyObject(dsl)],
      response: [inspectStringifyObject(response)],
    };
    const showMorePagesIndicator = totalCount > fakeTotalCount;
    return {
      edges,
      inspect,
      pageInfo: {
        activePage: activePage ? activePage : 0,
        fakeTotalCount,
        showMorePagesIndicator,
      },
      totalCount,
    };
  }
}

const getTopNFlowEdges = (
  response: DatabaseSearchResponse<NetworkTopNFlowData, TermAggregation>,
  options: NetworkTopNFlowRequestOptions
): NetworkTopNFlowEdges[] => {
  if (options.pagination && options.pagination.querySize >= DEFAULT_MAX_TABLE_QUERY_SIZE) {
    throw new Error(`No query size above ${DEFAULT_MAX_TABLE_QUERY_SIZE}`);
  }
  if (options.flowDirection === FlowDirection.uniDirectional) {
    return formatTopNFlowEdges(
      getOr([], 'aggregations.top_uni_flow.buckets', response),
      options.flowTarget
    );
  }
  return formatTopNFlowEdges(
    getOr([], 'aggregations.top_bi_flow.buckets', response),
    options.flowTarget
  );
};

const formatTopNFlowEdges = (
  buckets: NetworkTopNFlowBuckets[],
  flowTarget: FlowTarget
): NetworkTopNFlowEdges[] =>
  buckets.map((bucket: NetworkTopNFlowBuckets) => ({
    node: {
      _id: bucket.key,
      [flowTarget]: {
        count: getOrNumber('ip_count.value', bucket),
        domain: bucket.domain.buckets.map(bucketDomain => bucketDomain.key),
        ip: bucket.key,
      },
      network: {
        bytes: getOrNumber('bytes.value', bucket),
        packets: getOrNumber('packets.value', bucket),
        direction: bucket.direction.buckets.map(bucketDir => bucketDir.key),
      },
    },
    cursor: {
      value: bucket.key,
      tiebreaker: null,
    },
  }));

const formatDnsEdges = (buckets: NetworkDnsBuckets[]): NetworkDnsEdges[] =>
  buckets.map((bucket: NetworkDnsBuckets) => ({
    node: {
      _id: bucket.key,
      dnsBytesIn: getOrNumber('dns_bytes_in.value', bucket),
      dnsBytesOut: getOrNumber('dns_bytes_out.value', bucket),
      dnsName: bucket.key,
      queryCount: bucket.doc_count,
      uniqueDomains: getOrNumber('unique_domains.value', bucket),
    },
    cursor: {
      value: bucket.key,
      tiebreaker: null,
    },
  }));

const getOrNumber = (path: string, bucket: NetworkTopNFlowBuckets | NetworkDnsBuckets) => {
  const numb = get(path, bucket);
  if (numb == null) {
    return null;
  }
  return numb;
};
