/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Alert } from '@apache-superset/core/components';
import { Button, Loading } from '@superset-ui/core/components';
import useXeokitViewer from './useXeokitViewer';
import { BimChartProps } from './types';

const Container = styled.div`
  position: relative;
  overflow: hidden;
`;

const Center = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.sizeUnit * 4}px;
  text-align: center;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

export default function BimChart(props: BimChartProps) {
  const { width, height, modelUrl, backgroundColor, showEdges } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // Bump to force the hook effect to re-run on retry without changing modelUrl.
  const [retryKey, setRetryKey] = useState(0);

  const { loading, error } = useXeokitViewer(containerRef, {
    modelUrl: modelUrl ? `${modelUrl}#${retryKey}` : '',
    backgroundColor,
    showEdges,
  });

  return (
    <Container style={{ width, height, background: backgroundColor }}>
      <div ref={containerRef} style={{ width, height }} data-test="bim-container" />
      {!modelUrl && (
        <Center>{t('Select a model column with a model UUID.')}</Center>
      )}
      {modelUrl && loading && (
        <Center>
          <Loading />
        </Center>
      )}
      {modelUrl && error && (
        <Center>
          <Alert
            type="error"
            showIcon
            closable={false}
            description={error}
            action={
              <Button
                buttonSize="small"
                onClick={() => setRetryKey(k => k + 1)}
              >
                {t('Retry')}
              </Button>
            }
          >
            {t('File storage is currently unavailable.')}
          </Alert>
        </Center>
      )}
    </Container>
  );
}
