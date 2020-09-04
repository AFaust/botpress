import { Button, Tab, Tabs, Tooltip } from '@blueprintjs/core'
import { BotEvent, ExecuteNode, FlowNode, FlowVariable } from 'botpress/sdk'
import { Dropdown, Icons, lang, MoreOptions, MoreOptionsItems, RightSidebar } from 'botpress/shared'
import cx from 'classnames'
import { LocalActionDefinition, Variables } from 'common/typings'
import _ from 'lodash'
import React, { FC, Fragment, useCallback, useEffect, useRef, useState } from 'react'
import * as portals from 'react-reverse-portal'

import contentStyle from '../ContentForm/style.scss'

import style from './style.scss'
import ConfigAction from './ConfigAction'

interface Props {
  node: FlowNode
  customKey: string
  contentLang: string
  variables: Variables
  actions: LocalActionDefinition[]
  portalNode: any
  events: BotEvent[]
  formData: ExecuteNode
  onUpdate: (data: Partial<ExecuteNode>) => void
  onUpdateVariables: (variable: FlowVariable) => void
  deleteNode: () => void
  close: () => void
}

const newAction = { label: 'Code New Action', value: '__newAction' }

const ExecuteForm: FC<Props> = ({
  node,
  customKey,
  actions,
  variables,
  events,
  formData,
  contentLang,
  portalNode,
  close,
  deleteNode,
  onUpdate,
  onUpdateVariables
}) => {
  const [canOutsideClickClose, setCanOutsideClickClose] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const selectedAction = useRef(formData?.actionName)
  const originalCode = useRef(formData?.code ?? '')
  const flowArgs = useRef(variables.currentFlow.map(x => ({ name: x.params.name, type: `BP.${x.type}.Variable` })))

  const updateCode = useCallback(
    _.debounce((value: string) => onUpdate({ code: value }), 1000),
    []
  )

  const isCodeEditor = selectedAction.current === newAction.value

  useEffect(() => {
    if (isCodeEditor) {
      updateCode.cancel()

      flowArgs.current = variables.currentFlow.map(x => ({ name: x.params.name, type: `BP.${x.type}.Variable` }))
      originalCode.current = formData?.code ?? ''

      setMaximized(true)
      setForceUpdate(!forceUpdate)
    }
  }, [customKey])

  useEffect(() => {
    document.documentElement.style.setProperty('--right-sidebar-width', maximized ? '580px' : '240px')
  }, [maximized])

  const moreOptionsItems: MoreOptionsItems[] = [
    {
      label: lang.tr('deleteNode'),
      action: deleteNode,
      type: 'delete'
    }
  ]

  const toggleSize = () => {
    setMaximized(!maximized)
  }

  const onActionChanged = (actionName: string) => {
    selectedAction.current = actionName
    onUpdate({ actionName })

    if (actionName === newAction.value && !maximized) {
      setMaximized(true)
    }
  }

  const onlyLegacy = actions.filter(a => a.legacy)
  const allActions = [newAction, ...onlyLegacy.map(x => ({ label: `${x.category} - ${x.title}`, value: x.name }))]
  const selectedOption = allActions.find(a => a.value === selectedAction.current)

  const commonProps = {
    customKey,
    contentLang,
    formData,
    events,
    variables,
    onUpdate,
    onUpdateVariables
  }

  return (
    <RightSidebar
      className={style.wrapper}
      canOutsideClickClose={canOutsideClickClose}
      close={() => {
        if (isCodeEditor) {
          updateCode.flush()
        }
        close()
      }}
    >
      <Fragment key={`${node?.id}`}>
        <div className={style.formHeader}>
          <Tabs id="contentFormTabs">
            <Tab id="content" title={lang.tr('studio.flow.nodeType.execute')} />
          </Tabs>
          <div>
            <MoreOptions show={showOptions} onToggle={setShowOptions} items={moreOptionsItems} />
            <Tooltip content={lang.tr(maximized ? 'minimizeInspector' : 'maximizeInspector')}>
              <Button
                className={style.expandBtn}
                small
                minimal
                icon={maximized ? <Icons.Minimize /> : 'fullscreen'}
                onClick={toggleSize}
              />
            </Tooltip>
          </div>
        </div>
        <div className={cx(contentStyle.fieldWrapper, contentStyle.contentTypeField)}>
          <span className={contentStyle.formLabel}>{lang.tr('Action')}</span>

          <Dropdown
            filterable
            className={contentStyle.formSelect}
            items={allActions}
            rightIcon="chevron-down"
            defaultItem={selectedOption}
            confirmChange={
              selectedOption && {
                message: lang.tr('studio.content.confirmChangeContentType'),
                acceptLabel: lang.tr('change'),
                callback: setCanOutsideClickClose
              }
            }
            onChange={option => onActionChanged(option.value)}
          />
        </div>

        {selectedOption !== undefined && (
          <Fragment>
            {isCodeEditor ? (
              <div className={style.editorWrap}>
                <portals.OutPortal
                  node={portalNode}
                  onChange={data => updateCode(data.content)}
                  code={originalCode.current}
                  args={flowArgs.current}
                  maximized={maximized}
                />
              </div>
            ) : (
              <ConfigAction {...commonProps} actions={actions} actionName={selectedAction.current} />
            )}
          </Fragment>
        )}
      </Fragment>
    </RightSidebar>
  )
}

export default ExecuteForm
